#include "stdafx.h"

#include "discord_ipc.h"

#include <windows.h>

#include <cstdio>
#include <cstring>

namespace verdant {

namespace {

constexpr uint32_t kOpHandshake = 0;
constexpr uint32_t kOpFrame = 1;

// The only throttle: a floor between sends, to collapse a seek-storm into a few updates
// rather than one per event. Deliberately small, and deliberately the ONLY one -- see the
// note on last_send_ in the header for why the 5-per-20s budget that used to sit here was
// both wrong and the cause of the card appearing to freeze while skipping tracks.
constexpr auto kMinInterval = std::chrono::milliseconds(100);
constexpr auto kReconnectDelay = std::chrono::seconds(10);
constexpr uint32_t kReadTimeoutMs = 4000;

// Frames are capped well below anything Discord sends, so a wild length from a desynced
// stream is treated as a protocol error rather than a 2GB allocation.
constexpr uint32_t kMaxFrame = 64 * 1024;

void json_escape(const std::string& in, std::string& out) {
    for (const char c : in) {
        switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            // foobar2000 hands us UTF-8 and JSON wants UTF-8, so multi-byte sequences pass
            // through untouched; only C0 controls have to be escaped.
            if (static_cast<unsigned char>(c) < 0x20) {
                char buf[8];
                std::snprintf(buf, sizeof buf, "\\u%04x", static_cast<unsigned char>(c));
                out += buf;
            } else {
                out += c;
            }
            break;
        }
    }
}

void json_member(std::string& out, const char* key, const std::string& value) {
    if (value.empty()) return;
    out += ",\"";
    out += key;
    out += "\":\"";
    json_escape(value, out);
    out += '"';
}

std::string build_set_activity(const activity& a, uint32_t nonce) {
    std::string s;
    s.reserve(640);
    s += "{\"cmd\":\"SET_ACTIVITY\",\"nonce\":\"";
    s += std::to_string(nonce);
    s += "\",\"args\":{\"pid\":";
    s += std::to_string(static_cast<uint32_t>(GetCurrentProcessId()));

    // No "activity" member at all is how a presence is removed; an empty object is not.
    if (a.clear) {
        s += "}}";
        return s;
    }

    // type 2 = Listening, which is what makes the card read "Listening to" rather than
    // "Playing". Third-party apps were locked out of this for years; it works now.
    s += ",\"activity\":{\"type\":2";
    json_member(s, "details", a.details);
    json_member(s, "state", a.state);

    if (a.ts_start > 0 && a.ts_end > a.ts_start) {
        s += ",\"timestamps\":{\"start\":";
        s += std::to_string(a.ts_start);
        s += ",\"end\":";
        s += std::to_string(a.ts_end);
        s += '}';
    }

    if (!a.large_image.empty() || !a.small_image.empty()) {
        std::string assets;
        json_member(assets, "large_image", a.large_image);
        json_member(assets, "large_text", a.large_text);
        json_member(assets, "small_image", a.small_image);
        json_member(assets, "small_text", a.small_text);
        if (!assets.empty()) {
            s += ",\"assets\":{";
            s += assets.substr(1);   // drop the leading comma json_member always writes
            s += '}';
        }
    }

    s += "}}}";
    return s;
}

} // namespace

ipc_client::~ipc_client() {
    stop();
}

void ipc_client::log(const char* msg) const {
    if (log_) log_(msg);
}

void ipc_client::start(std::string app_id, log_fn log) {
    stop();
    {
        std::lock_guard<std::mutex> lk(m_);
        app_id_ = std::move(app_id);
        log_ = std::move(log);
        stop_ = false;
        dirty_ = false;
        want_ = activity{};
    }
    thread_ = std::thread([this] { run(); });
}

void ipc_client::stop() {
    if (!thread_.joinable()) return;
    {
        std::lock_guard<std::mutex> lk(m_);
        stop_ = true;
    }
    cv_.notify_all();
    thread_.join();
}

void ipc_client::set(const activity& a) {
    {
        std::lock_guard<std::mutex> lk(m_);
        if (!thread_.joinable()) return;
        // Already the state we want, whether or not it has gone out yet. A reconnect
        // re-asserts it by setting dirty_ directly, so dropping it here is safe.
        if (want_ == a) return;
        want_ = a;
        dirty_ = true;
    }
    cv_.notify_one();
}

std::chrono::milliseconds ipc_client::gate_delay(std::chrono::steady_clock::time_point now) const {
    using namespace std::chrono;
    if (last_send_.time_since_epoch().count() == 0) return milliseconds(0);
    const auto since = now - last_send_;
    if (since < kMinInterval) return duration_cast<milliseconds>(kMinInterval - since);
    return milliseconds(0);
}

bool ipc_client::connect() {
    // Stable, PTB and Canary each take a slot, and the user may be running more than one,
    // so walk the range instead of assuming -0.
    for (int i = 0; i < 10; ++i) {
        char name[64];
        std::snprintf(name, sizeof name, "\\\\.\\pipe\\discord-ipc-%d", i);

        const HANDLE h = CreateFileA(name, GENERIC_READ | GENERIC_WRITE, 0, nullptr,
                                     OPEN_EXISTING, 0, nullptr);
        if (h == INVALID_HANDLE_VALUE) continue;

        pipe_ = h;
        if (handshake()) {
            char msg[96];
            std::snprintf(msg, sizeof msg, "connected to discord-ipc-%d", i);
            log(msg);
            return true;
        }
        disconnect();
    }
    return false;
}

void ipc_client::disconnect() {
    if (!pipe_) return;
    CloseHandle(static_cast<HANDLE>(pipe_));
    pipe_ = nullptr;
}

bool ipc_client::handshake() {
    std::string id;
    {
        std::lock_guard<std::mutex> lk(m_);
        id = app_id_;
    }
    std::string json = "{\"v\":1,\"client_id\":\"";
    json_escape(id, json);
    json += "\"}";

    if (!send_frame(kOpHandshake, json)) return false;

    std::string reply;
    if (!read_frame(kReadTimeoutMs, reply)) {
        log("handshake: no reply");
        return false;
    }
    // A full JSON parser would buy nothing here: the only question is whether Discord said
    // READY, and anything else is logged verbatim for the user to paste into a bug report.
    if (reply.find("\"READY\"") == std::string::npos) {
        log("handshake rejected by Discord");
        log(reply.c_str());
        return false;
    }
    return true;
}

bool ipc_client::send_frame(uint32_t op, const std::string& json) {
    if (!pipe_) return false;

    std::string frame;
    frame.resize(8 + json.size());
    const uint32_t len = static_cast<uint32_t>(json.size());
    std::memcpy(frame.data(), &op, 4);        // x86/x64 are little-endian, which is the wire order
    std::memcpy(frame.data() + 4, &len, 4);
    std::memcpy(frame.data() + 8, json.data(), json.size());

    const char* p = frame.data();
    size_t left = frame.size();
    while (left > 0) {
        DWORD wrote = 0;
        if (!WriteFile(static_cast<HANDLE>(pipe_), p, static_cast<DWORD>(left), &wrote, nullptr) || wrote == 0) {
            return false;
        }
        p += wrote;
        left -= wrote;
    }
    return true;
}

bool ipc_client::read_exact(void* buf, uint32_t count, uint32_t timeout_ms) {
    // The pipe is opened in blocking byte mode, so a plain ReadFile on an idle connection
    // would park this thread forever and stall shutdown. Peeking first means we only ever
    // ask for bytes that have already arrived, and the wait stays bounded.
    auto* out = static_cast<uint8_t*>(buf);
    uint32_t got = 0;
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);

    while (got < count) {
        DWORD avail = 0;
        if (!PeekNamedPipe(static_cast<HANDLE>(pipe_), nullptr, 0, nullptr, &avail, nullptr)) return false;
        if (avail == 0) {
            if (std::chrono::steady_clock::now() >= deadline) return false;
            Sleep(20);
            continue;
        }
        DWORD want = count - got;
        if (avail < want) want = avail;
        DWORD read = 0;
        if (!ReadFile(static_cast<HANDLE>(pipe_), out + got, want, &read, nullptr) || read == 0) return false;
        got += read;
    }
    return true;
}

bool ipc_client::read_frame(uint32_t timeout_ms, std::string& out) {
    uint8_t header[8];
    if (!read_exact(header, sizeof header, timeout_ms)) return false;

    uint32_t len = 0;
    std::memcpy(&len, header + 4, 4);
    if (len > kMaxFrame) return false;

    out.assign(len, '\0');
    if (len > 0 && !read_exact(out.data(), len, timeout_ms)) return false;
    return true;
}

bool ipc_client::push(const activity& a) {
    const std::string json = build_set_activity(a, ++nonce_);
    if (!send_frame(kOpFrame, json)) return false;

    // Discord echoes every command back. Reading the echo is flow control -- without it the
    // pipe's buffer fills with replies nobody collected.
    std::string reply;
    if (!read_frame(kReadTimeoutMs, reply)) return false;
    if (reply.find("\"ERROR\"") != std::string::npos) {
        log("Discord rejected the activity:");
        log(reply.c_str());
        // The connection is still good; the payload was not. Report success so we don't
        // reconnect in a loop over something a reconnect cannot fix.
    }
    return true;
}

void ipc_client::run() {
    std::unique_lock<std::mutex> lk(m_);

    while (!stop_) {
        if (!pipe_) {
            state_.store(link_state::connecting, std::memory_order_relaxed);
            lk.unlock();
            const bool ok = connect();   // pipe_ is worker-only, so no lock needed
            lk.lock();
            if (stop_) break;
            if (!ok) {
                state_.store(link_state::off, std::memory_order_relaxed);
                // Discord may simply not be running yet. Keep quiet and retry.
                cv_.wait_for(lk, kReconnectDelay);
                continue;
            }
            state_.store(link_state::live, std::memory_order_relaxed);
            dirty_ = true;   // a fresh connection starts blank: re-assert what we want shown
        }

        if (!dirty_) {
            cv_.wait(lk);
            continue;
        }

        const auto now = std::chrono::steady_clock::now();
        const auto wait = gate_delay(now);
        if (wait.count() > 0) {
            cv_.wait_for(lk, wait);
            continue;   // re-read want_ after waiting: it may have moved on again
        }

        const activity a = want_;
        dirty_ = false;
        lk.unlock();
        const bool ok = push(a);
        lk.lock();

        if (ok) {
            last_send_ = std::chrono::steady_clock::now();
        } else {
            log("lost the Discord connection");
            lk.unlock();
            disconnect();
            lk.lock();
            state_.store(link_state::off, std::memory_order_relaxed);
            dirty_ = true;   // retry on the next connection
        }
    }

    // Leave nothing behind on the user's profile.
    if (pipe_) {
        lk.unlock();
        activity gone;
        gone.clear = true;
        push(gone);
        disconnect();
        lk.lock();
    }
    state_.store(link_state::off, std::memory_order_relaxed);
}

} // namespace verdant
