-- QuickBinds core: namespace, commands, keybind-mode entry, settings opening,
-- binding persistence. Feature code lands here task by task (see docs/plans/).
QuickBinds = {
    Name = "Quick Binds",
}

local MSG_COMBAT = "Quick Binds: keybindings are protected in combat.";
local MSG_NO_MODE = "Quick Binds: Quick Keybind Mode is not available on this client.";

-- Enter Blizzard's Quick Keybind Mode. The mode lives in the LoadOnDemand addon
-- Blizzard_QuickKeybind; ShowUIPanel(QuickKeybindFrame) is the entry point (its own
-- Okay button commits bindings via KeybindListener:Commit()).
function QuickBinds.EnterQuickKeybindMode()
    if InCombatLockdown() then
        DEFAULT_CHAT_FRAME:AddMessage(MSG_COMBAT);
        return;
    end
    local load = (C_AddOns and C_AddOns.LoadAddOn) or LoadAddOn;
    local loaded = load("Blizzard_QuickKeybind");
    if not loaded then
        DEFAULT_CHAT_FRAME:AddMessage(MSG_NO_MODE);
        return;
    end
    ShowUIPanel(QuickKeybindFrame);
end

SLASH_QUICKBIND1 = "/qb";
SlashCmdList["QUICKBIND"] = function()
    QuickBinds.EnterQuickKeybindMode();
end;
