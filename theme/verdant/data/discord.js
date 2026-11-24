/* verdant/data/discord.js -- Discord presence: keeps foo_verdant in step with the panel
   property. Loaded by main.js; every module shares one global scope, so load order is
   set there. */

/* ------------------------- Discord presence ------------------------- foo_verdant
   publishes the playing track to your Discord profile and owns the pipe to the Discord
   client; whether to publish at all is decided here, alongside the rest of the theme's
   settings, so there is ONE place to turn it off rather than two that can disagree. The
   component's own main-menu item stays the source of truth for its state and this reads
   that checkmark rather than keeping a second copy, so the one lever available is to
   run the toggle when the two disagree; everything here no-ops when foo_verdant is
   absent. */

var drpPresent = false,
  drpPath = null;

/* The menu command's path is DISCOVERED rather than hardcoded: enumerating costs a walk
   of the main menu, so this runs once at load and never from a paint, and renaming the
   item in the component cannot silently break the toggle. Finding the command is also
   what proves the component is there, rather than asking utils.CheckComponent, whose
   file name (foo_verdant.dll) and declared name (Verdant Discord Presence) would each
   answer no to the other string. */
function drpFind() {
  drpPresent = false;
  drpPath = null;
  var cmds = [];
  try {
    cmds = JSON.parse(fb.EnumerateMainMenuCommands());
  } catch (e) {
    return;
  }
  for (var i = 0; i < cmds.length; i++) {
    var p = cmds[i].FullPath || "";
    if (p.toLowerCase().indexOf("discord presence") >= 0) {
      drpPath = p;
      drpPresent = true;
      return;
    }
  }
}

function drpIsOn() {
  if (!drpPath) return false;
  try {
    return !!fb.IsMainMenuCommandChecked(drpPath);
  } catch (e) {
    return false;
  }
}

/* Run once at startup, from app.js: the property is what the user asked for, the
   checkmark is what is currently true, and this makes them agree. Turning it OFF
   matters more than turning it on, since with the component disabled nothing is
   published and no connection to Discord is made at all. */
function drpSync() {
  drpFind();
  if (!drpPresent) {
    // Not an error: the theme is perfectly usable without it, and the installer only adds
    // components that are missing, so a deliberate removal should stay removed.
    if (DRP_ON)
      console.log(
        "Verdant: Discord presence is on, but foo_verdant is not installed.",
      );
    return;
  }
  if (drpIsOn() !== DRP_ON) {
    try {
      fb.RunMainMenuCommand(drpPath);
    } catch (e) {}
  }
}
