#include "stdafx.h"

#include "art.h"
#include "discord_ipc.h"

// ----------------------------------------------------------------------------------------
// foo_verdant -- Verdant's own Discord presence component.
//
// Scope is deliberately narrow: this owns the pipe to Discord and nothing else. Every
// decision that could live in JavaScript does live in JavaScript, in the Verdant panel --
// the panel drives the toggle through the main menu command registered below, and reads
// the connection state back through the %verdant_drp% title-format field. That split is
// the whole reason this exists rather than a third-party component: a 500-line pipe writer
// is a far smaller thing to own than a feature.
//
// Part of Verdant, a Spotify-style theme for foobar2000. MIT licensed.
// ----------------------------------------------------------------------------------------

DECLARE_COMPONENT_VERSION(
    "Verdant Discord Presence",
    "1.0.0",
    "Shows the playing track on your Discord profile.\n"
    "\n"
    "Part of Verdant, a Spotify-style theme for foobar2000.\n"
    "https://github.com/superziper/verdant-foobar2000-theme\n"
    "\n"
    "Talks to the local Discord client over its IPC pipe. Track title, artist and album are\n"
    "sent to Discord while it is enabled; nothing else leaves your machine, and album art is\n"
    "referenced by URL rather than uploaded.\n"
    "\n"
    "Copyright (c) superziper. MIT licensed.");

VALIDATE_COMPONENT_FILENAME("foo_verdant.dll");
FOOBAR2000_IMPLEMENT_CFG_VAR_DOWNGRADE;

namespace {

// My GUIDs. Generate your own if you reuse this code.
constexpr GUID guid_cmd_toggle = { 0x1f0e020c,0x5c6a,0x4894,{0xac,0xc4,0x6d,0x82,0xb3,0x9e,0x5e,0xa2} };
constexpr GUID guid_cfg_enabled = { 0xec866459,0x17af,0x4ddd,{0xb2,0xf1,0x9f,0x51,0x3b,0xb0,0x3b,0x55} };
constexpr GUID guid_cfg_app_id = { 0x5e334f71,0x911a,0x421f,{0xb0,0x1a,0x6b,0xe7,0x9a,0x6c,0xaa,0x1d} };
constexpr GUID guid_cfg_tf_details = { 0xd09df9a2,0x3fe5,0x490d,{0xbb,0xa9,0x8c,0x96,0x47,0x51,0xcf,0xf8} };
constexpr GUID guid_cfg_tf_state = { 0xe0b03f23,0x927d,0x4f07,{0xaf,0xa4,0xa2,0xb7,0xa0,0xa2,0x38,0x8e} };
constexpr GUID guid_cfg_tf_large_text = { 0x08742d90,0x9514,0x4c85,{0x89,0xf0,0x5f,0xe2,0x22,0xf6,0xb1,0x24} };
constexpr GUID guid_cfg_tf_large_image = { 0x8aa86dc4,0x6324,0x4115,{0xbc,0xa6,0xcf,0x3a,0xf0,0xeb,0x68,0x17} };
constexpr GUID guid_cfg_hide_paused = { 0x1e964ede,0xe0af,0x43d6,{0xa2,0xad,0x6b,0x97,0x85,0x36,0x57,0xf3} };

cfg_bool cfg_enabled(guid_cfg_enabled, true);

// Remove the card entirely while paused, which is what Spotify does.
//
// The alternative is worse than it sounds. Discord has no paused state, so a paused card
// has to omit `timestamps` -- and an activity without timestamps does not show "no time",
// it shows time elapsed since the activity was last set. The card then displays a counter
// that climbs while the music is stopped, which reads exactly like playback. Freezing the
// bar instead is not possible either: Discord animates it client-side from start/end, so
// holding a position would mean re-sending every second, far past the rate limit.
//
// Set this false to keep a "Paused" card and accept Discord's own climbing counter.
cfg_bool cfg_hide_paused(guid_cfg_hide_paused, true);

// Verdant's own Discord application. Its NAME is what the card's header reads ("Listening
// to <name>") and what Discord puts on the member-list line -- neither is settable from the
// payload, so the application name is the only control we have over either. Named
// "foobar2000", because that is what is actually playing the music.
//
// The application also hosts the fallback art assets, keyed `foobar2000`, `playing` and
// `paused`. If an asset key is missing, Discord silently drops the image from the activity
// rather than erroring, so a card with no art usually means a missing asset, not a bug here.
cfg_string cfg_app_id(guid_cfg_app_id, "1562717948530003978");

// Spotify's card is the reference, and its hierarchy is song first, everything else second:
// Discord renders `details` as the prominent line, so the TITLE goes there. Putting the album
// on line 1 (the convention foo_discord_rich inherited) both buries the song and truncates,
// because album names are the longest string on the card and the least interesting.
//
// Artist and album share line 2. That leaves the cover's hover text with nothing of its own
// to say, so it says nothing -- an empty script omits the field entirely rather than padding
// the card with the theme's own name.
cfg_string cfg_tf_details(guid_cfg_tf_details, "[%title%]");
cfg_string cfg_tf_state(guid_cfg_tf_state, "[%artist%][ \xc2\xb7 %album%]");
cfg_string cfg_tf_large_text(guid_cfg_tf_large_text, "");

// Discord will not read a local file, so the cover has to be reachable by URL. A track
// tagged with a MusicBrainz release id already has one, free and without uploading
// anything: the Cover Art Archive serves it. Everything else falls back to the static
// asset in the Discord application, so no user's artwork is ever published anywhere.
cfg_string cfg_tf_large_image(
    guid_cfg_tf_large_image,
    "$if(%musicbrainz_albumid%,https://coverartarchive.org/release/%musicbrainz_albumid%/front-500,foobar2000)");

verdant::ipc_client g_client;

// The last activity we built, kept so a cover arriving late can be applied WITHOUT going
// back to the main thread. That hop used to cost far more than the lookup it was waiting
// for: a track change is exactly when the panel is busiest -- repaints, now-playing, its own
// artwork pipeline -- and a main-thread callback queues behind all of it.
//
// Swapping one string needs no foobar API at all, so the resolver thread does it directly.
std::mutex g_last_m;
verdant::activity g_last;
std::string g_last_artist, g_last_album, g_last_title;

struct scripts {
    titleformat_object::ptr details, state, large_text, large_image;
    // Not configurable: these are what the cover lookup searches on, not what is displayed.
    titleformat_object::ptr artist, album, title;
};
scripts g_tf;

void compile_scripts() {
    auto compiler = titleformat_compiler::get();
    compiler->compile_safe(g_tf.details, cfg_tf_details.get());
    compiler->compile_safe(g_tf.state, cfg_tf_state.get());
    compiler->compile_safe(g_tf.large_text, cfg_tf_large_text.get());
    compiler->compile_safe(g_tf.large_image, cfg_tf_large_image.get());
    compiler->compile_safe(g_tf.artist, "%album artist%");
    compiler->compile_safe(g_tf.album, "%album%");
    compiler->compile_safe(g_tf.title, "%title%");
}

// foobar hands out profile paths in its own URI form; the art cache is a plain file.
std::string profile_file(const char* name) {
    std::string path = core_api::get_profile_path();
    static const std::string scheme = "file://";
    if (path.compare(0, scheme.size(), scheme) == 0) path = path.substr(scheme.size());
    if (!path.empty() && path.back() != '\\' && path.back() != '/') path += '\\';
    return path + name;
}

int64_t unix_now() {
    using namespace std::chrono;
    return duration_cast<seconds>(system_clock::now().time_since_epoch()).count();
}

// Resolve the covers for what is coming up, while the current track still has minutes left.
//
// This is what keeps a skip instant. Looking a cover up when the track starts puts a network
// round trip on the critical path, and no amount of tuning removes it -- the card shows the
// fallback until the answer arrives. Looking it up a song early moves the whole cost off the
// path: by the time the user presses next, the answer is already in the cache and the first
// activity we send carries the real art.
//
// Two items ahead, not one, so a double-skip still lands warm. Costs nothing when they are
// already known: art::get() returns immediately for a cached album, and misses are remembered
// too, so a track with no match is never asked about twice.
void prefetch_upcoming() {
    auto pm = playlist_manager::get();
    t_size playlist = 0, index = 0;
    if (!pm->get_playing_item_location(&playlist, &index)) return;

    const t_size count = pm->playlist_get_item_count(playlist);
    for (t_size step = 1; step <= 2; ++step) {
        const t_size at = index + step;
        if (at >= count) break;   // shuffle makes "next" a guess anyway; don't wrap

        metadb_handle_ptr item;
        if (!pm->playlist_get_item_handle(item, playlist, at) || item.is_empty()) continue;

        pfc::string8 artist, album, title;
        if (g_tf.artist.is_valid()) item->format_title(nullptr, artist, g_tf.artist, nullptr);
        if (g_tf.album.is_valid()) item->format_title(nullptr, album, g_tf.album, nullptr);
        if (g_tf.title.is_valid()) item->format_title(nullptr, title, g_tf.title, nullptr);
        verdant::art::get(std::string(artist.c_str()), std::string(album.c_str()),
                          std::string(title.c_str()));
    }
}

// Reads the current playback state and tells the client what the card should look like.
// Main thread only -- everything here is a foobar service call.
void refresh() {
    verdant::activity a;

    // Every exit goes through publish(), so g_last always reflects what Discord is showing.
    // A cleared card recorded here is also what stops a cover that resolves a moment after
    // you hit stop from quietly putting the card back up.
    const auto publish = [](const verdant::activity& act, const std::string& artist = {},
                            const std::string& album = {}, const std::string& title = {}) {
        {
            std::lock_guard<std::mutex> lk(g_last_m);
            g_last = act;
            g_last_artist = artist;
            g_last_album = album;
            g_last_title = title;
        }
        g_client.set(act);
    };

    if (!cfg_enabled) {
        a.clear = true;
        publish(a);
        return;
    }

    auto pc = playback_control::get();
    if (!pc->is_playing() || (pc->is_paused() && cfg_hide_paused)) {
        a.clear = true;
        publish(a);
        return;
    }

    const auto eval = [&pc](const titleformat_object::ptr& script) -> std::string {
        if (script.is_empty()) return {};
        pfc::string8 out;
        pc->playback_format_title(nullptr, out, script, nullptr,
                                  playback_control::display_level_titles);
        return std::string(out.c_str());
    };

    a.details = eval(g_tf.details);
    a.state = eval(g_tf.state);
    a.large_text = eval(g_tf.large_text);

    // A matched cover wins; otherwise fall back to the script, which resolves a
    // MusicBrainz-tagged file straight to the Cover Art Archive and everything else to the
    // static asset. A miss here is not a failure: the lookup runs in the background and
    // calls us again when it lands.
    const std::string artist = eval(g_tf.artist);
    const std::string album = eval(g_tf.album);
    const std::string title = eval(g_tf.title);
    a.large_image = verdant::art::get(artist, album, title);
    if (a.large_image.empty()) a.large_image = eval(g_tf.large_image);


    if (pc->is_paused()) {
        // Discord has no paused state. Dropping the timestamps is what makes the progress
        // bar disappear instead of running on while the music is stopped.
        a.small_image = "paused";
        a.small_text = "Paused";
    } else {
        a.small_image = "playing";
        a.small_text = "Playing";

        const double length = pc->playback_get_length_ex();
        const double position = pc->playback_get_position();
        // A stream has no length, so it gets no bar -- a bar that cannot end would just sit
        // at 100%. Everything else gets both timestamps, which is what Discord draws from.
        if (length > 0.0) {
            a.ts_start = unix_now() - static_cast<int64_t>(position);
            a.ts_end = a.ts_start + static_cast<int64_t>(length);
        }
    }

    publish(a, artist, album, title);
}

// Called on the art resolver's own thread when a cover lands. Touches no foobar API, so it
// needs neither the main thread nor a lock on anything foobar owns -- it takes the activity
// we last published, swaps the one string that changed, and sends it.
void on_art_resolved() {
    verdant::activity a;
    std::string artist, album, title;
    {
        std::lock_guard<std::mutex> lk(g_last_m);
        a = g_last;
        artist = g_last_artist;
        album = g_last_album;
        title = g_last_title;
    }
    if (a.clear || artist.empty()) return;   // nothing on screen to correct

    const std::string url = verdant::art::get(artist, album, title);
    if (url.empty() || url == a.large_image) return;   // not our album, or already right

    a.large_image = url;
    {
        std::lock_guard<std::mutex> lk(g_last_m);
        // Only if the track has not moved on underneath us while we were looking.
        if (g_last_artist != artist || g_last_album != album) return;
        g_last = a;
    }
    g_client.set(a);
}

void log_line(const char* msg) {
    // console::print is safe from any thread, which matters: this is handed to the IPC
    // worker and called from there.
    console::print("Verdant Discord: ", msg);
}

void start_client() {
    g_client.start(std::string(cfg_app_id.get().c_str()), log_line);
}

// ---- lifecycle -------------------------------------------------------------------------

class init : public initquit {
public:
    void on_init() override {
        compile_scripts();
        verdant::art::start(profile_file("verdant-drp-art.txt"), on_art_resolved);
        if (cfg_enabled) {
            start_client();
            refresh();
        }
    }
    void on_quit() override {
        g_client.stop();
        verdant::art::stop();
    }
};
initquit_factory_t<init> g_init;

// ---- playback --------------------------------------------------------------------------

class playback : public play_callback_static {
public:
    unsigned get_flags() override {
        // Only the events that actually change the card. Notably NOT on_playback_time:
        // Discord animates the bar itself from start+end, so a per-second update would
        // burn the rate limit to send a payload identical to the last one.
        return flag_on_playback_new_track | flag_on_playback_stop | flag_on_playback_pause |
               flag_on_playback_seek | flag_on_playback_dynamic_info_track;
    }

    // Prefetch only here: a pause or a seek does not change what is coming up, and the
    // lookups are deduped anyway, so there is nothing to gain by asking again.
    void on_playback_new_track(metadb_handle_ptr) override {
        refresh();
        if (cfg_enabled) prefetch_upcoming();
    }
    void on_playback_stop(play_control::t_stop_reason) override { refresh(); }
    void on_playback_pause(bool) override { refresh(); }
    void on_playback_seek(double) override { refresh(); }
    void on_playback_dynamic_info_track(const file_info&) override { refresh(); }

    void on_playback_starting(play_control::t_track_command, bool) override {}
    void on_playback_edited(metadb_handle_ptr) override {}
    void on_playback_dynamic_info(const file_info&) override {}
    void on_playback_time(double) override {}
    void on_volume_change(float) override {}
};
play_callback_static_factory_t<playback> g_playback;

// ---- the toggle the Verdant panel drives ------------------------------------------------

class menu : public mainmenu_commands {
public:
    t_uint32 get_command_count() override { return 1; }
    GUID get_command(t_uint32) override { return guid_cmd_toggle; }

    void get_name(t_uint32, pfc::string_base& out) override { out = "Discord presence"; }

    bool get_description(t_uint32, pfc::string_base& out) override {
        out = "Show the playing track on your Discord profile";
        return true;
    }

    GUID get_parent() override { return mainmenu_groups::library; }

    // The checkmark is the single source of truth for the panel: Verdant reads it with
    // fb.IsMainMenuCommandChecked rather than keeping a second copy of this state.
    bool get_display(t_uint32 index, pfc::string_base& text, t_uint32& flags) override {
        get_name(index, text);
        flags = cfg_enabled ? flag_checked : 0;
        return true;
    }

    void execute(t_uint32, service_ptr_t<service_base>) override {
        const bool on = !cfg_enabled;
        cfg_enabled = on;
        if (on) {
            start_client();
            refresh();
        } else {
            // Blocks only as long as clearing the presence takes, which is a write and an
            // echo -- milliseconds in practice, and it is a deliberate user action.
            g_client.stop();
        }
    }
};
mainmenu_commands_factory_t<menu> g_menu;

// ---- %verdant_drp%, so the panel can tell the truth -------------------------------------

class fields : public metadb_display_field_provider {
public:
    t_uint32 get_field_count() override { return 1; }

    void get_field_name(t_uint32, pfc::string_base& out) override { out = "verdant_drp"; }

    bool process_field(t_uint32, metadb_handle*, titleformat_text_out* out) override {
        const char* text = "off";
        if (cfg_enabled) {
            switch (g_client.state()) {
            case verdant::link_state::live: text = "live"; break;
            case verdant::link_state::connecting: text = "connecting"; break;
            default: text = "off"; break;
            }
        }
        out->write(titleformat_inputtypes::unknown, text);
        return true;
    }
};
service_factory_single_t<fields> g_fields;

} // namespace
