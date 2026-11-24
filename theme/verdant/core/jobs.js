/* verdant/core/jobs.js -- deferred section builds run in time-budgeted slices. Loaded
   by main.js; every module shares one global scope, so load order is set there. */

/* ---- deferred section builds
   ------------------------------------------------------------- The panel has one
   thread, so a section that builds its data inline blocks the paint that should be
   showing a loading state, and blocks input with it. Instead a section reports not-
   ready, paints a skeleton, and builds in short steps on timer ticks; the unsplittable
   units are a single EvalWithMetadbs and Array.sort. */
/* Steps run in time-budgeted slices, not one per tick. A Windows timer lands ~15ms out,
   which turned an eleven-step 20ms build into ~165ms, so a slice instead runs steps
   until its budget is spent and the FIRST slice runs synchronously. */
var jobs = {},
  JOB_BUDGET = 8;
function jobRun(key, steps) {
  if (jobs[key]) return;
  jobs[key] = { i: 0, steps: steps, t: Date.now() };
  jobSlice(key, false);
}
function jobSlice(key, fromTimer) {
  var j = jobs[key];
  if (!j) return;
  var t0 = Date.now();
  while (j.i < j.steps.length) {
    var again = false;
    try {
      again = j.steps[j.i]() === true;
    } catch (e) {}
    if (!again) j.i++;
    if (Date.now() - t0 >= JOB_BUDGET) break;
  }
  if (j.i >= j.steps.length) {
    delete jobs[key];
    // only repaint if we actually yielded; a build that finished inline is already being drawn
    if (fromTimer) {
      repaintMain();
      if (R.queue) repaintQueue();
    }
    return;
  }
  window.SetTimeout(function () {
    jobSlice(key, true);
  }, 1);
}
function ensureBuilt(key, ready, steps) {
  if (ready()) {
    if (jobs[key]) delete jobs[key];
    return true;
  }
  jobRun(key, steps());
  return ready(); // fast builds complete inside the synchronous first slice
}
// A build that finishes quickly must not flash a skeleton, so nothing is drawn for the first
// 150ms -- on the fast path that is a frame or two and invisible.
var SKEL_DELAY = 150;
function skelVisible(key) {
  var j = jobs[key];
  return !!j && Date.now() - j.t > SKEL_DELAY;
}
