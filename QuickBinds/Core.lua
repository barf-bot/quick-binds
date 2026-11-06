-- QuickBinds core: namespace, commands, keybind-mode entry, settings opening,
-- binding persistence. Feature code lands here task by task (see docs/plans/).
QuickBinds = {
    Name = "Quick Binds",
}

local MSG_COMBAT = "Quick Binds: keybindings are protected in combat.";
local MSG_NO_MODE = "Quick Binds: Quick Keybind Mode is not available on this client.";
local MSG_NO_PANEL = "Quick Binds: the Keybindings panel is not available here - use Esc > Keybindings.";

local function LoadOnDemand(name)
    local load = (C_AddOns and C_AddOns.LoadAddOn) or LoadAddOn;
    return load(name);
end

-- Enter Blizzard's Quick Keybind Mode. The mode lives in the LoadOnDemand addon
-- Blizzard_QuickKeybind; ShowUIPanel(QuickKeybindFrame) is the entry point (its own
-- Okay button commits bindings via KeybindListener:Commit()).
function QuickBinds.EnterQuickKeybindMode()
    if InCombatLockdown() then
        DEFAULT_CHAT_FRAME:AddMessage(MSG_COMBAT);
        return;
    end
    local loaded = LoadOnDemand("Blizzard_QuickKeybind");
    if not loaded then
        DEFAULT_CHAT_FRAME:AddMessage(MSG_NO_MODE);
        return;
    end
    ShowUIPanel(QuickKeybindFrame);
end

-- Open the Esc > Keybindings settings panel. Settings.KEYBINDINGS_CATEGORY_ID is set
-- by Blizzard_SettingsDefinitions_Frame (Keybindings.lua:282), which Blizzard_Settings
-- does NOT depend on, so both addons must be demanded. If the client doesn't hand the
-- panel over, print one chat line - never a Lua error (accepted fallback).
function QuickBinds.OpenKeybindSettings()
    if InCombatLockdown() then
        DEFAULT_CHAT_FRAME:AddMessage(MSG_COMBAT);
        return;
    end
    LoadOnDemand("Blizzard_Settings");
    LoadOnDemand("Blizzard_SettingsDefinitions_Frame");
    local categoryID = Settings and Settings.KEYBINDINGS_CATEGORY_ID;
    if not categoryID then
        DEFAULT_CHAT_FRAME:AddMessage(MSG_NO_PANEL);
        return;
    end
    if not pcall(Settings.OpenToCategory, categoryID) then
        DEFAULT_CHAT_FRAME:AddMessage(MSG_NO_PANEL);
    end
end

SLASH_QUICKBIND1 = "/qb";
SlashCmdList["QUICKBIND"] = function()
    QuickBinds.EnterQuickKeybindMode();
end;

SLASH_QUICKBINDK1 = "/qbk";
SlashCmdList["QUICKBINDK"] = function()
    QuickBinds.OpenKeybindSettings();
end;

-- Binding persistence. Quick Keybind Mode applies SetBinding immediately in memory,
-- but only a SaveBindings writes it to disk. Esc exits the mode through
-- QuickKeybindFrameMixin:CancelBinding, which first reverts unsaved changes with
-- LoadBindings (Blizzard_QuickKeybind/QuickKeybind.lua:178-205), so saving on the
-- frame's OnHide would be too late for the Esc path. Saving on every
-- KeybindListener.RebindSuccess (triggered per accepted rebind in
-- Blizzard_Settings_Shared/Blizzard_Keybindings.lua:117) means the Esc revert reloads
-- already-saved state: Esc keeps new binds, exactly like Okay. PLAYER_LOGOUT saves as
-- a safety net for anything left uncommitted at session end.
local function SaveCurrentBindings()
    SaveBindings(GetCurrentBindingSet());
end

EventRegistry:RegisterCallback("KeybindListener.RebindSuccess", SaveCurrentBindings);

local logoutSaver = CreateFrame("Frame");
logoutSaver:RegisterEvent("PLAYER_LOGOUT");
logoutSaver:SetScript("OnEvent", SaveCurrentBindings);
