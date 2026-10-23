/* verdant/data/discord.js -- Discord presence: keeps foo_verdant in step with the panel property
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- Discord presence -------------------------
   foo_verdant publishes the playing track to your Discord profile. It owns the pipe to the
   Discord client and nothing else; whether to publish at all is decided here, alongside the
   rest of the theme's settings, so there is ONE place to turn it off (right-click >
   Properties) rather than two that can disagree.

   The component's own main-menu item stays the source of truth for its state -- this reads
   that checkmark rather than keeping a second copy of it, the same discipline the normalize
   pill uses with foobar's own ReplayGain mode. The panel cannot write the component's
   setting directly (it lives in foobar's config, which no script can reach), so the one
   lever available is to run the toggle when the two disagree.

   Everything here no-ops when foo_verdant is absent: the theme installs fine without it, and
   someone who deleted the component should not get errors for the privilege. */

var drpPresent = false, drpPath = null;

/* The menu command's path is DISCOVERED rather than hardcoded. Enumerating costs a walk of
   the main menu, which is why this runs once at load and never from a paint -- and it means
   renaming the item in the component can't silently break the toggle. That failure would be
   invisible otherwise, since the symptom is simply that nothing happens.

   Finding the command is also what proves the component is there, rather than asking
   utils.CheckComponent: the component's file is foo_verdant.dll but its declared name is
   "Verdant Discord Presence", and CheckComponent matching on both would answer no to either
   string. The command either exists or it doesn't, and that is the thing we actually need. */
function drpFind(){
  drpPresent=false; drpPath=null;
  var cmds=[];
  try{ cmds=JSON.parse(fb.EnumerateMainMenuCommands()); }catch(e){ return; }
  for(var i=0;i<cmds.length;i++){
    var p=cmds[i].FullPath||'';
    if(p.toLowerCase().indexOf('discord presence')>=0){ drpPath=p; drpPresent=true; return; }
  }
}

function drpIsOn(){
  if(!drpPath) return false;
  try{ return !!fb.IsMainMenuCommandChecked(drpPath); }catch(e){ return false; }
}

/* Run once at startup, from app.js. The property is what the user asked for; the checkmark is
   what is currently true; this makes them agree. Turning it OFF matters more than turning it
   on: with the component disabled nothing is published and no connection to Discord is made
   at all, which is the behaviour someone setting the property to 0 is asking for. */
function drpSync(){
  drpFind();
  if(!drpPresent){
    // Not an error: the theme is perfectly usable without it, and the installer only adds
    // components that are missing, so a deliberate removal should stay removed.
    if(DRP_ON) console.log('Verdant: Discord presence is on, but foo_verdant is not installed.');
    return;
  }
  if(drpIsOn()!==DRP_ON){
    try{ fb.RunMainMenuCommand(drpPath); }catch(e){}
  }
}
