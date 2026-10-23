#include "stdafx.h"

#include "art.h"

#include <windows.h>
#include <winhttp.h>

#include <algorithm>
#include <condition_variable>
#include <deque>
#include <fstream>
#include <mutex>
#include <thread>
#include <unordered_map>
#include <unordered_set>

#pragma comment(lib, "winhttp.lib")

namespace verdant {
namespace art {

namespace {

std::mutex g_m;
std::condition_variable g_cv;
std::thread g_thread;
bool g_stop = false;

std::unordered_map<std::string, std::string> g_cache;   // album key -> url
std::unordered_set<std::string> g_tried;                // keys already looked up and missed
struct job {
    std::string artist, album, title;
};
std::deque<job> g_queue;
std::string g_cache_path;
std::function<void()> g_on_resolved;

// An untagged album would otherwise collapse every one of an artist's loose tracks onto a
// single cache entry, so the title stands in when there is no album to key on.
std::string key_for(const std::string& artist, const std::string& album, const std::string& title) {
    std::string k = artist + " - " + (album.empty() ? title : album);
    std::transform(k.begin(), k.end(), k.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return k;
}

std::string url_encode(const std::string& in) {
    static const char* hex = "0123456789ABCDEF";
    std::string out;
    out.reserve(in.size() * 3);
    for (const unsigned char c : in) {
        if (std::isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
            out += static_cast<char>(c);
        } else if (c == ' ') {
            out += '+';
        } else {
            out += '%';
            out += hex[c >> 4];
            out += hex[c & 0x0f];
        }
    }
    return out;
}

std::wstring widen(const std::string& s) {
    if (s.empty()) return {};
    const int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
    std::wstring out(static_cast<size_t>(n), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), out.data(), n);
    return out;
}

// Pulls one string value out of a JSON document without a parser. These responses are
// machine-generated and we want exactly one field from each, so a full parser would be a
// dependency bought for nothing. Handles the escapes that actually occur: both catalogues
// escape their URL slashes.
std::string json_string(const std::string& doc, const char* key) {
    const std::string needle = std::string("\"") + key + "\":\"";
    const size_t at = doc.find(needle);
    if (at == std::string::npos) return {};

    std::string out;
    for (size_t i = at + needle.size(); i < doc.size(); ++i) {
        const char c = doc[i];
        if (c == '"') break;
        if (c == '\\' && i + 1 < doc.size()) {
            const char n = doc[++i];
            switch (n) {
            case '/': out += '/'; break;
            case '"': out += '"'; break;
            case '\\': out += '\\'; break;
            case 'n': case 'r': case 't': break;   // never meaningful inside a URL
            default: out += n; break;
            }
            continue;
        }
        out += c;
    }
    return out;
}

// One session for the life of the component, rather than one per lookup. WinHTTP pools
// connections per session, so the second and later albums skip DNS and the TLS handshake
// entirely -- which is most of what a lookup costs.
//
// Touched only from the resolver thread, and closed in stop() after that thread has joined.
HINTERNET g_session = nullptr;

HINTERNET http_session() {
    if (!g_session) {
        // DEFAULT_PROXY, not AUTOMATIC_PROXY: the automatic mode runs WPAD discovery, which
        // on a network with no proxy still costs a broadcast and a timeout before falling
        // back to direct. That showed up as a flat delay on the first cover of every session.
        g_session = WinHttpOpen(L"foo_verdant/1.0 (+https://github.com/superziper/verdant-foobar2000-theme)",
                                WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
        // Nothing here is worth hanging a thread over; a missed cover is a fallback image.
        if (g_session) WinHttpSetTimeouts(g_session, 4000, 4000, 4000, 6000);
    }
    return g_session;
}

void close_session() {
    if (!g_session) return;
    WinHttpCloseHandle(g_session);
    g_session = nullptr;
}

bool https_get(const wchar_t* host, const std::wstring& path, std::string& body) {
    bool ok = false;
    const HINTERNET sess = http_session();
    if (!sess) return false;

    if (HINTERNET connect = WinHttpConnect(sess, host, INTERNET_DEFAULT_HTTPS_PORT, 0)) {
        if (HINTERNET request = WinHttpOpenRequest(connect, L"GET", path.c_str(), nullptr,
                                                   WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                                                   WINHTTP_FLAG_SECURE)) {
            if (WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                                   WINHTTP_NO_REQUEST_DATA, 0, 0, 0) &&
                WinHttpReceiveResponse(request, nullptr)) {

                DWORD status = 0, size = sizeof status;
                WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                                    WINHTTP_HEADER_NAME_BY_INDEX, &status, &size, WINHTTP_NO_HEADER_INDEX);
                if (status == 200) {
                    DWORD avail = 0;
                    while (WinHttpQueryDataAvailable(request, &avail) && avail > 0) {
                        const size_t at = body.size();
                        body.resize(at + avail);
                        DWORD read = 0;
                        if (!WinHttpReadData(request, body.data() + at, avail, &read)) break;
                        body.resize(at + read);
                        if (body.size() > 1u << 20) break;   // a search result, not a download
                    }
                    ok = !body.empty();
                }
            }
            WinHttpCloseHandle(request);
        }
        WinHttpCloseHandle(connect);
    }
    // The session deliberately outlives the request: see http_session().
    return ok;
}

// --- matching ----------------------------------------------------------------------------
// Taking the catalogue's first hit on trust is how "NIKI - Nicole" ended up showing an album
// by NICKI NICOLE: the right answer was the FIFTH result. Rank means popularity, not
// correctness, so the results are now checked rather than assumed, and a set of results with
// nothing convincing in it produces no cover at all -- the plain sleeve is a better answer
// than confidently showing the wrong record.

// Lowercase, strip punctuation to single spaces, keep non-ASCII bytes intact so that titles
// which are mostly non-Latin still compare meaningfully.
std::string norm(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (const unsigned char c : s) {
        if (std::isalnum(c)) out += static_cast<char>(std::tolower(c));
        else if (c >= 0x80) out += static_cast<char>(c);
        else if (!out.empty() && out.back() != ' ') out += ' ';
    }
    while (!out.empty() && out.back() == ' ') out.pop_back();
    return out;
}

// Either may carry a qualifier the other lacks -- catalogues append " - Single", " - EP" or
// "(Deluxe Edition)", while tags often do not -- so a prefix ending on a word boundary counts.
bool same_title(const std::string& a, const std::string& b) {
    if (a.empty() || b.empty()) return false;
    if (a == b) return true;
    const std::string& shorter = a.size() < b.size() ? a : b;
    const std::string& longer = a.size() < b.size() ? b : a;
    if (longer.compare(0, shorter.size(), shorter) != 0) return false;
    return longer[shorter.size()] == ' ';
}

// Artists are looser: a catalogue credits "88rising & NIKI" where the tag says "NIKI", and a
// tag may say "NIKI feat. someone". Containment either way, on normalised text, covers both
// without matching NICKI NICOLE to NIKI.
bool same_artist(const std::string& a, const std::string& b) {
    if (a.empty() || b.empty()) return false;
    return a.find(b) != std::string::npos || b.find(a) != std::string::npos;
}

// Walks the result objects in a response, which both catalogues emit back to back. Splitting
// on a per-object marker keeps this honest without a JSON parser: fields are read only from
// within one object, so a near-miss can no longer borrow the right album's artwork.
template <typename Fn>
void for_each_result(const std::string& body, const char* marker, Fn&& fn) {
    size_t at = body.find(marker);
    while (at != std::string::npos) {
        const size_t next = body.find(marker, at + 1);
        if (fn(body.substr(at, (next == std::string::npos ? body.size() : next) - at))) return;
        at = next;
    }
}

// Qualifiers a tag carries but a catalogue usually does not. Stripped from the QUERY only --
// validation still runs against the untouched tag, where same_title()'s word-boundary prefix
// rule accepts the shorter catalogue name.
std::string clean_album(const std::string& album) {
    static const char* junk[] = { "deluxe", "edition", "remaster", "explicit",
                                  "version", "bonus", "disc", "anniversary" };
    std::string out;
    out.reserve(album.size());
    size_t i = 0;
    while (i < album.size()) {
        const char c = album[i];
        if (c == '(' || c == '[') {
            const char close = (c == '(') ? ')' : ']';
            const size_t end = album.find(close, i);
            if (end != std::string::npos) {
                const std::string inner = norm(album.substr(i + 1, end - i - 1));
                bool drop = false;
                for (const char* j : junk) {
                    if (inner.find(j) != std::string::npos) { drop = true; break; }
                }
                if (drop) { i = end + 1; continue; }
            }
        }
        out += c;
        ++i;
    }
    // Trailing " - Single" / " - EP", which iTunes appends and tags rarely carry.
    const std::string n = norm(out);
    for (const char* suffix : { " single", " ep" }) {
        const size_t at = n.rfind(suffix);
        if (at != std::string::npos && at + std::strlen(suffix) == n.size()) {
            out = out.substr(0, out.size() - (n.size() - at));
            break;
        }
    }
    while (!out.empty() && (out.back() == ' ' || out.back() == '-')) out.pop_back();
    return out.empty() ? album : out;
}

std::string itunes_artwork(const std::string& one) {
    std::string url = json_string(one, "artworkUrl100");
    // The search API only returns the 100px thumbnail, but the same asset is served at any
    // size by swapping the dimensions in the path.
    const size_t at = url.rfind("100x100");
    if (at != std::string::npos) url.replace(at, 7, "600x600");
    return url;
}

std::string from_itunes_album(const std::string& artist, const std::string& album) {
    if (album.empty()) return {};
    const std::wstring path = L"/search?term=" + widen(url_encode(artist + " " + clean_album(album))) +
                              L"&entity=album&limit=10";
    std::string body;
    if (!https_get(L"itunes.apple.com", path, body)) return {};

    const std::string want_artist = norm(artist), want_album = norm(album);
    std::string found;
    for_each_result(body, "\"wrapperType\"", [&](const std::string& one) {
        if (!same_title(norm(json_string(one, "collectionName")), want_album)) return false;
        if (!same_artist(norm(json_string(one, "artistName")), want_artist)) return false;
        found = itunes_artwork(one);
        return !found.empty();
    });
    return found;
}

// The rescue path for bad album tags: a track's own entry carries the artwork of whatever
// release it belongs to. Where an album tag does exist, a result that also matches it is
// preferred -- a popular song can appear on a single, an album and three compilations, and
// the album tag is the only hint as to which pressing the user actually owns.
std::string from_itunes_song(const std::string& artist, const std::string& album,
                             const std::string& title) {
    if (title.empty()) return {};
    const std::wstring path = L"/search?term=" + widen(url_encode(artist + " " + title)) +
                              L"&entity=song&limit=10";
    std::string body;
    if (!https_get(L"itunes.apple.com", path, body)) return {};

    const std::string want_artist = norm(artist), want_title = norm(title), want_album = norm(album);
    std::string best, exact;
    for_each_result(body, "\"wrapperType\"", [&](const std::string& one) {
        if (!same_title(norm(json_string(one, "trackName")), want_title)) return false;
        if (!same_artist(norm(json_string(one, "artistName")), want_artist)) return false;
        const std::string url = itunes_artwork(one);
        if (url.empty()) return false;
        if (!want_album.empty() && same_title(norm(json_string(one, "collectionName")), want_album)) {
            exact = url;
            return true;   // the right pressing: stop looking
        }
        if (best.empty()) best = url;
        return false;      // keep looking for one that matches the album too
    });
    return exact.empty() ? best : exact;
}

// MusicBrainz plus the Cover Art Archive. Slower and rate-limited, but it carries indie,
// regional and non-commercial releases that the commercial catalogues simply do not list --
// in testing it was the only source besides Deezer to have an Indonesian rock album.
std::string from_musicbrainz(const std::string& artist, const std::string& album) {
    if (album.empty()) return {};
    // MusicBrainz asks for no more than one request per second. This is the last resort in
    // the chain and runs on a background thread, so simply waiting is the honest answer.
    Sleep(1100);

    const std::string query = "artist:\"" + artist + "\" AND release:\"" + clean_album(album) + "\"";
    const std::wstring path = L"/ws/2/release/?query=" + widen(url_encode(query)) + L"&fmt=json&limit=5";
    std::string body;
    if (!https_get(L"musicbrainz.org", path, body)) return {};

    const std::string want_album = norm(album);
    std::string url;
    for_each_result(body, "\"score\"", [&](const std::string& one) {
        if (!same_title(norm(json_string(one, "title")), want_album)) return false;
        const std::string mbid = json_string(one, "id");
        if (mbid.size() != 36) return false;

        // Ask the archive what it actually holds rather than guessing a URL: a release with
        // no artwork would otherwise yield a link that 404s, which is worse than the sleeve.
        std::string caa;
        if (!https_get(L"coverartarchive.org", L"/release/" + widen(mbid), caa)) return false;
        const size_t front = caa.find("\"front\":true");
        if (front == std::string::npos) return false;
        // Prefer the 500px thumbnail; fall back to the full-size image.
        const size_t at = caa.rfind("\"500\":\"", front);
        url = (at != std::string::npos) ? json_string(caa.substr(at), "500") : json_string(caa, "image");
        return !url.empty();
    });
    return url;
}

std::string from_deezer(const std::string& artist, const std::string& album) {
    // Kept at one result deliberately. A Deezer album puts its artist in a NESTED object
    // after the cover fields, so splitting the response into per-album chunks the way the
    // iTunes reader does would pair one album's artist with the next album's title. With a
    // single result there is nothing to misalign, and this is only the fallback anyway.
    if (album.empty()) return {};
    const std::wstring path = L"/search/album?limit=1&q=" + widen(url_encode(artist + " " + clean_album(album)));
    std::string body;
    if (!https_get(L"api.deezer.com", path, body)) return {};

    if (!same_title(norm(json_string(body, "title")), norm(album))) return {};
    // "name" appears only inside the nested artist object on a Deezer album.
    if (!same_artist(norm(json_string(body, "name")), norm(artist))) return {};
    return json_string(body, "cover_big");
}

// --- cache ------------------------------------------------------------------------------

void load_cache() {
    std::ifstream in(g_cache_path, std::ios::binary);
    if (!in) return;
    std::string line;
    while (std::getline(in, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        const size_t tab = line.find('\t');
        if (tab == std::string::npos || tab == 0) continue;
        const std::string key = line.substr(0, tab), url = line.substr(tab + 1);
        // An empty URL is a remembered miss, not a cover.
        if (url.empty()) g_tried.insert(key);
        else g_cache[key] = url;
    }
}

void append_cache(const std::string& key, const std::string& url) {
    std::ofstream out(g_cache_path, std::ios::binary | std::ios::app);
    if (!out) return;
    out << key << '\t' << url << '\n';
}

void run() {
    std::unique_lock<std::mutex> lk(g_m);
    while (!g_stop) {
        if (g_queue.empty()) {
            g_cv.wait(lk);
            continue;
        }
        const auto j = g_queue.front();
        g_queue.pop_front();
        lk.unlock();

        // Ordered by precision, then by coverage. The album search is the most exact when
        // the tag is good; the song search rescues the tag being bad; Deezer and MusicBrainz
        // carry what the commercial catalogue never listed. Measured over a mixed sample no
        // single source managed better than 7 of 8, while the chain found all of them.
        std::string url = from_itunes_album(j.artist, j.album);
        if (url.empty()) url = from_itunes_song(j.artist, j.album, j.title);
        if (url.empty()) url = from_deezer(j.artist, j.album);
        if (url.empty()) url = from_musicbrainz(j.artist, j.album);

        lk.lock();
        const std::string key = key_for(j.artist, j.album, j.title);
        if (!url.empty()) {
            g_cache[key] = url;
            append_cache(key, url);
            auto notify = g_on_resolved;
            lk.unlock();
            if (notify) notify();
            lk.lock();
        } else {
            // Remember the miss, and remember it on DISK: a library with obscure material
            // would otherwise re-ask the same unanswerable question on every restart, and
            // the MusicBrainz leg of that costs a second each time.
            g_tried.insert(key);
            append_cache(key, "");
        }
    }
}

} // namespace

void start(const std::string& cache_path, std::function<void()> on_resolved) {
    stop();
    {
        std::lock_guard<std::mutex> lk(g_m);
        g_cache_path = cache_path;
        g_on_resolved = std::move(on_resolved);
        g_stop = false;
        g_cache.clear();
        g_tried.clear();
        g_queue.clear();
        load_cache();
    }
    g_thread = std::thread(run);
}

void stop() {
    if (!g_thread.joinable()) return;
    {
        std::lock_guard<std::mutex> lk(g_m);
        g_stop = true;
    }
    g_cv.notify_all();
    g_thread.join();
    close_session();   // safe here: the only thread that touches it has gone
}

std::string get(const std::string& artist, const std::string& album, const std::string& title) {
    // An album is no longer required -- the song search works without one -- but an artist
    // and something to call the record still are.
    if (artist.empty() || (album.empty() && title.empty())) return {};

    const std::string key = key_for(artist, album, title);
    std::lock_guard<std::mutex> lk(g_m);

    const auto hit = g_cache.find(key);
    if (hit != g_cache.end()) return hit->second;
    if (g_tried.count(key)) return {};
    if (!g_thread.joinable()) return {};

    for (const auto& q : g_queue) {
        if (key_for(q.artist, q.album, q.title) == key) return {};   // already queued
    }
    g_queue.push_back({ artist, album, title });
    g_cv.notify_one();
    return {};
}

} // namespace art
} // namespace verdant
