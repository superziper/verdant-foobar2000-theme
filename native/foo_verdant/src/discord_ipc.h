#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>

// Discord Rich Presence over the local IPC pipe. Deliberately knows nothing about
// foobar2000: everything here is plain Win32 + std, so it can be reasoned about without
// the player in the picture.
//
// Every constant below is a fixed property of the Discord client, measured rather than
// guessed, and identical for every user -- nothing here is detected at runtime.
namespace verdant {

// What Discord shows on the card. Mirrors the SET_ACTIVITY payload rather than anything
// foobar-shaped, so presence.cpp owns the translation and this file stays dumb.
struct activity {
    std::string details;      // line 1
    std::string state;        // line 2
    std::string large_image;  // an asset key in the Discord app, OR an external https URL
    std::string large_text;   // line 3; shown on cover hover
    std::string small_image;
    std::string small_text;
    // Unix time in SECONDS. Discord accepts seconds and normalises to milliseconds itself
    // (verified: sending 1792641436 came back as 1792641436000). Both must be set for the
    // progress bar to appear; leaving them at 0 is how a paused track loses its bar.
    int64_t ts_start = 0;
    int64_t ts_end = 0;
    bool clear = false;       // send an empty activity, i.e. remove the card

    bool operator==(const activity& o) const = default;
};

enum class link_state { off, connecting, live };

class ipc_client {
public:
    using log_fn = std::function<void(const char*)>;

    ipc_client() = default;
    ~ipc_client();

    ipc_client(const ipc_client&) = delete;
    ipc_client& operator=(const ipc_client&) = delete;

    // Starts the worker thread. Returns immediately: connecting to Discord can block for
    // as long as a pipe open takes, and this must never happen on foobar's main thread.
    void start(std::string app_id, log_fn log);
    // Clears the presence, closes the pipe and joins. Safe to call when not started.
    void stop();

    // Thread-safe. Coalescing: identical state is dropped, and while the rate gate is shut
    // only the NEWEST state survives to be sent.
    void set(const activity& a);

    link_state state() const { return state_.load(std::memory_order_relaxed); }

private:
    void run();

    // These five touch pipe_ and are called ONLY from the worker thread, which is why they
    // need no lock of their own.
    bool connect();
    void disconnect();
    bool handshake();
    bool push(const activity& a);
    bool send_frame(uint32_t op, const std::string& json);
    bool read_frame(uint32_t timeout_ms, std::string& out);
    bool read_exact(void* buf, uint32_t count, uint32_t timeout_ms);

    void log(const char* msg) const;
    // 0 if a send may go now, otherwise how long to wait for the coalescing floor.
    std::chrono::milliseconds gate_delay(std::chrono::steady_clock::time_point now) const;

    std::thread thread_;
    mutable std::mutex m_;
    std::condition_variable cv_;
    bool stop_ = false;
    bool dirty_ = false;
    activity want_;
    std::string app_id_;
    log_fn log_;
    void* pipe_ = nullptr;   // HANDLE, kept as void* to keep windows.h out of this header
    uint32_t nonce_ = 0;

    // Only a coalescing floor, deliberately: measured against a live client, the local pipe
    // accepted 12 updates 300ms apart without refusing one. The widely quoted "5 per 20
    // seconds" is the GATEWAY presence limit, which the Discord client enforces upstream by
    // collapsing updates itself -- imposing it here as well only delayed our own sends, and
    // made rapid track-skipping look like the card had frozen.
    std::chrono::steady_clock::time_point last_send_{};

    std::atomic<link_state> state_{ link_state::off };
};

} // namespace verdant
