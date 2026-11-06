-- QuickBinds minimap button: a plain circular Button parented to the Minimap.
-- C_Minimap has no RegisterMinimapButton on this client (tools/check-apis.mjs asserts
-- its absence), so this is the manual LibDBIcon-style build with no external libraries:
-- the circle comes from the client's own portrait alpha mask, the hover glow from the
-- minimap's own highlight texture. Left-drag moves the button (StartMoving consumes the
-- press, so a click only fires when you don't drag); the position is stored in
-- QuickBindsDB.minimapButton in viewport units and restored on every load.
-- `/qbcenter` clears the saved position and re-centers above the minimap.

local QuickBinds = QuickBinds;

local SIZE = 32;
local CIRCLE_MASK = "Interface\\CharacterFrame\\TempPortraitAlphaMask";
local MOUSE_HILIGHT = "Interface\\Buttons\\UI-Common-MouseHilight";

local button;

local function ApplyDefaultPosition()
    button:ClearAllPoints();
    button:SetPoint("CENTER", Minimap, "TOP", 0, 4);
end

local function SavePosition()
    local x, y = button:GetCenter();
    if not x or not y then
        return;
    end
    -- Viewport coordinates converted to UIParent scale: survives minimap cvar moves.
    local scaleRatio = button:GetEffectiveScale() / UIParent:GetEffectiveScale();
    QuickBindsDB.minimapButton = { x = x * scaleRatio, y = y * scaleRatio };
end

local function RestorePosition()
    local pos = QuickBindsDB and QuickBindsDB.minimapButton;
    if pos and pos.x and pos.y then
        button:ClearAllPoints();
        button:SetPoint("CENTER", UIParent, "BOTTOMLEFT", pos.x, pos.y);
    else
        ApplyDefaultPosition();
    end
end

function QuickBinds.RecenterButton()
    if QuickBindsDB then
        QuickBindsDB.minimapButton = nil;
    end
    ApplyDefaultPosition();
    DEFAULT_CHAT_FRAME:AddMessage("Quick Binds: button re-centered above the minimap.");
end

local function CreateButton()
    button = CreateFrame("Button", "QuickBindsMinimapButton", Minimap);
    button:SetSize(SIZE, SIZE);
    button:SetClampedToScreen(true);
    button:EnableMouse(true);
    button:RegisterForDrag("LeftButton");

    local background = button:CreateTexture(nil, "BACKGROUND");
    background:SetAllPoints(true);
    background:SetColorTexture(0.09, 0.09, 0.12, 0.95);
    background:SetMask(CIRCLE_MASK);

    local label = button:CreateFontString(nil, "OVERLAY", "GameFontNormal");
    label:SetPoint("CENTER");
    label:SetText("KB");

    button:RegisterForClicks("LeftButtonUp", "RightButtonUp");
    button:SetScript("OnClick", function(self, buttonName)
        if buttonName == "RightButton" then
            QuickBinds.EnterQuickKeybindMode();
        end
    end);

    button:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT");
        GameTooltip:SetText("Quick Binds", 1, 1, 1);
        GameTooltip:AddLine("Right-click: Quick Keybind Mode");
        GameTooltip:Show();
    end);
    button:SetScript("OnLeave", function()
        GameTooltip:Hide();
    end);

    button:SetScript("OnDragStart", function(self)
        self:StartMoving();
    end);
    button:SetScript("OnDragStop", function(self)
        self:StopMovingOrSizing();
        SavePosition();
    end);
end

local init = CreateFrame("Frame");
init:RegisterEvent("ADDON_LOADED");
init:SetScript("OnEvent", function(self, event, addonName)
    if addonName ~= "QuickBinds" then
        return;
    end
    self:UnregisterEvent("ADDON_LOADED");
    QuickBindsDB = QuickBindsDB or {};
    CreateButton();
    RestorePosition();
end);

SLASH_QUICKBINDSCENTER1 = "/qbcenter";
SlashCmdList["QUICKBINDSCENTER"] = function()
    QuickBinds.RecenterButton();
end;
