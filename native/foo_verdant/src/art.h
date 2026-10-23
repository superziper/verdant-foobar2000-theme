#pragma once

#include <functional>
#include <string>

// Cover art for the Discord card.
//
// Discord fetches card images from its own servers, so it will never read a local file: a
// cover has to be reachable by URL. Rather than uploading the user's artwork anywhere, this
// MATCHES the album against keyless public catalogues and uses the cover they already host.
// Nothing of the user's library is published, and the lookup sends only an artist and album
// name -- the same two strings already on the card.
//
// Results are cached on disk, keyed by album, so a given album is looked up once ever. The
// cache is a plain `key<TAB>url` text file, which is deliberate: it means the Verdant panel
// (or anything else, including a future uploader for albums no catalogue knows) can write
// entries into it and the component will simply use them.
namespace verdant {
namespace art {

// Loads the cache and starts the resolver thread. `on_resolved` fires on the resolver
// thread whenever a lookup lands, so the caller can re-send the activity.
void start(const std::string& cache_path, std::function<void()> on_resolved);
void stop();

// The URL for this album if it is known. Otherwise queues a lookup and returns empty --
// callers should fall back to their own default and wait for `on_resolved`.
//
// The track title is not decoration: searching by song is what rescues a file whose album
// tag is empty, says "Unknown Album", or carries a qualifier the catalogue does not use.
// Measured against deliberately messy tags, album search found 0 of 5 and song search 5 of 5.
std::string get(const std::string& artist, const std::string& album, const std::string& title);

} // namespace art
} // namespace verdant
