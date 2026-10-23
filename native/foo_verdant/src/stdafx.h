#pragma once

// The ATL-flavoured SDK entry header (helpers/foobar2000+atl.h, which foo_sample uses) drags
// in ATL and libPPUI. foo_verdant draws nothing and shows no dialogs, so it takes the plain
// SDK header instead -- which is why this builds on a bare VS BuildTools install with no
// ATL/MFC component.
#include <foobar2000/SDK/foobar2000.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <mutex>
#include <string>
#include <thread>
