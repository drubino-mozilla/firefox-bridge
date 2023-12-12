// -------------------------------------------
//          Firefox is Installed Logic
// -------------------------------------------
function getIsFirefoxInstalled() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["isFirefoxInstalled"], (result) => {
      if (result.isFirefoxInstalled === undefined) {
        // placeholder
        chrome.storage.local.set({ isFirefoxInstalled: true });
        resolve(true);
      } else {
        resolve(result.isFirefoxInstalled);
      }
    });
  });
}

// -------------------------------------------
//              Auto Redirect Logic
// -------------------------------------------
function getIsAutoRedirect() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["isAutoRedirect"], (result) => {
      if (result.isAutoRedirect === undefined) {
        resolve(true);
        chrome.storage.sync.set({ isAutoRedirect: true });
      } else {
        resolve(result.isAutoRedirect);
      }
    });
  });
}

function getExternalSites() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["firefoxSites"], (result) => {
      if (result.firefoxSites === undefined) {
        resolve([]);
      } else {
        resolve(result.firefoxSites);
      }
    });
  });
}

async function refreshDeclarativeNetRequestRules() {
  const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
  const newRules = [];
  const entries = await getExternalSites();

  for (const entry of entries) {
    const url = entry.url.replace(/\./g, "\\.").replace(/\*+/g, ".*");
    const rule = {
      id: entry.id,
      priority: 1,
      action: {
        type: "block",
        redirect: {
          regexSubstitution: entry.isPrivate ? "firefox-private:\\0" : "firefox:\\0",
        },
      },
      condition: {
        regexFilter: `http(s)?://${url}`,
        resourceTypes: ["main_frame"],
      },
    };
    newRules.push(rule);
  }

  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: oldRules.map((rule) => rule.id),
    addRules: newRules,
  });
}

async function handleAutoRedirect(webRequestDetails) {
  // prevent prerender (ie. when typing in "g" in the address bar and it prerenders "google.com")
  if (
    webRequestDetails.documentLifecycle === "prerender" ||
    !(await getIsAutoRedirect())
  ) {
    return;
  }

  const sites = await getExternalSites();
  for (const site of sites) {
    // replace . with \. and * with .* and force http(s)://
    const siteRegex = new RegExp(
      /http(s)?:\/\//.source +
        site.url.replace(/\./g, "\\.").replace(/\*+/g, ".*")
    );
    if (siteRegex.test(webRequestDetails.url)) {
      chrome.tabs.update(webRequestDetails.tabId, {
        url: site.isPrivate
          ? "firefox-private:" + webRequestDetails.url
          : "firefox:" + webRequestDetails.url,
      });
    }
  }
}

function restoreOriginalUrlBeforeRedirect(tabId) {
  chrome.storage.local.get(["originalUrlBeforeRedirect"], (result) => {
    if (result.originalUrlBeforeRedirect !== undefined) {
      chrome.tabs.update(tabId, {
        url: result.originalUrlBeforeRedirect,
      });
      chrome.storage.local.remove(["originalUrlBeforeRedirect"]);
    }
  });
}

// -------------------------------------------
//          Browser Launching Logic
// -------------------------------------------
let isCurrentTabValidUrlScheme = false;

function checkAndUpdateURLScheme(tab) {
  if (tab.url === undefined) isCurrentTabValidUrlScheme = false;
  else if (tab.url.startsWith("http") || tab.url.startsWith("file")) {
    isCurrentTabValidUrlScheme = true;
  } else {
    isCurrentTabValidUrlScheme = false;
  }
}

async function launchFirefox(tab, launchDefaultBrowsing) {
  if (!(await getIsFirefoxInstalled())) {
    chrome.tabs.create({ url: "https://www.mozilla.org/firefox/" });
    return false;
  }

  if (isCurrentTabValidUrlScheme) {
    if (launchDefaultBrowsing) {
      chrome.tabs.update(tab.id, { url: "firefox:" + tab.url });
    } else {
      chrome.tabs.update(tab.id, { url: "firefox-private:" + tab.url });
    }
    return true;
  }
  return false;
}

// -------------------------------------------
//            Context Menu Logic
// -------------------------------------------
function getCurrentTabSLD() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab.url === undefined || !currentTab.url.startsWith("http")) resolve("");

      try {
        const url = new URL(tabs[0].url);
        resolve(url.hostname.split(".").slice(-2).join("."));
      } catch (e) {
        resolve("");
      }
    });
  });
}

async function updateAddCurrentSiteContextMenu() {
  if (await getCurrentTabSLD() !== "") {
    chrome.contextMenus.update("addCurrentSiteContextMenu", {
      title: chrome.i18n.getMessage("Add_this_site_to_My_Firefox_Sites").replace("[SLD]", await getCurrentTabSLD()),
      enabled: true
    });
  } else {
    chrome.contextMenus.update("addCurrentSiteContextMenu", {
      title: chrome.i18n.getMessage("Add_this_site_to_My_Firefox_Sites").replace("[SLD] ", ""),
      enabled: false
    });
  }
}

async function initContextMenu() {
  // action context menu
  chrome.contextMenus.create({
    id: "changeDefaultLaunchContextMenu",
    title: chrome.i18n.getMessage("Always_use_Firefox_Private_Browsing"),
    contexts: ["action"],
    type: "checkbox",
    checked: !(await getIsFirefoxDefault()),
  });
  chrome.contextMenus.create({
    id: "alternativeLaunchContextMenu",
    title: chrome.i18n.getMessage(
      "Launch_this_page_in_Firefox_Private_Browsing"
    ),
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "separator",
    type: "separator",
    contexts: ["action"],
  });
  chrome.contextMenus.create({
    id: "addCurrentSiteContextMenu",
    title: chrome.i18n.getMessage("Add_this_site_to_My_Firefox_Sites").replace("[SLD] ", ""),
    contexts: ["action"],
    enabled: false
  });
  chrome.contextMenus.create({
    id: "autoRedirectCheckboxContextMenu",
    title: chrome.i18n.getMessage("auto_redirect_my_firefox_sites"),
    contexts: ["action"],
    type: "checkbox",
    checked: await getIsAutoRedirect(),
  });
  chrome.contextMenus.create({
    id: "manageExternalSitesContextMenu",
    title: chrome.i18n.getMessage("Manage_My_Firefox_Sites"),
    contexts: ["action"],
  });

  // page context menu
  chrome.contextMenus.create({
    id: "launchInFirefox",
    title: chrome.i18n.getMessage("Launch_this_page_in_Firefox"),
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "launchInFirefoxPrivate",
    title: chrome.i18n.getMessage(
      "Launch_this_page_in_Firefox_Private_Browsing"
    ),
    contexts: ["page"],
  });

  chrome.contextMenus.create({
    id: "launchInFirefoxLink",
    title: chrome.i18n.getMessage("Launch_this_link_in_Firefox"),
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "launchInFirefoxPrivateLink",
    title: chrome.i18n.getMessage(
      "Launch_this_link_in_Firefox_Private_Browsing"
    ),
    contexts: ["link"],
  });
}

function handleChangeDefaultLaunchContextMenuClick(isFirefoxDefault) {
  if (isFirefoxDefault) {
    chrome.contextMenus.update("alternativeLaunchContextMenu", {
      title: chrome.i18n.getMessage("Launch_this_page_in_Firefox"),
    });
  } else {
    chrome.contextMenus.update("alternativeLaunchContextMenu", {
      title: chrome.i18n.getMessage(
        "Launch_this_page_in_Firefox_Private_Browsing"
      ),
    });
  }
  chrome.storage.sync.set({ isFirefoxDefault: !isFirefoxDefault });
  updateToolbarIcon();
}

async function handleAutoRedirectCheckboxContextMenuClick() {
  const isAutoRedirect = await getIsAutoRedirect();

  // If disabling, remove all rules and keep them in storage
  // If enabling, add all rules from storage
  if (isAutoRedirect) {
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: (await chrome.declarativeNetRequest.getDynamicRules()).map(
        (rule) => rule.id
      ),
    });
  } else {
    await refreshDeclarativeNetRequestRules();
  }
  chrome.storage.sync.set({ isAutoRedirect: !isAutoRedirect });
}

async function handleContextMenuClick(info, tab) {
  const isFirefoxDefault = await getIsFirefoxDefault();
  if (info.menuItemId === "changeDefaultLaunchContextMenu") {
    handleChangeDefaultLaunchContextMenuClick(isFirefoxDefault);
  } else if (info.menuItemId === "alternativeLaunchContextMenu") {
    // launch in the opposite mode to the default
    await launchFirefox(tab, !isFirefoxDefault);
  } else if (
    info.menuItemId === "launchInFirefox" ||
    info.menuItemId === "launchInFirefoxLink"
  ) {
    await launchFirefox(tab, true);
  } else if (
    info.menuItemId === "launchInFirefoxPrivate" ||
    info.menuItemId === "launchInFirefoxPrivateLink"
  ) {
    await launchFirefox(tab, false);
  } else if (info.menuItemId === "manageExternalSitesContextMenu") {
    chrome.tabs.create({
      url: "pages/myFirefoxSites/index.html",
    });
  } else if (info.menuItemId === "autoRedirectCheckboxContextMenu") {
    await handleAutoRedirectCheckboxContextMenuClick();
  }
}

// -------------------------------------------
//            Toolbar Icon Logic
// -------------------------------------------
async function updateToolbarIcon() {
  let iconPath = (await getIsFirefoxDefault())
    ? {
      32: "images/firefox32.png",
    }
    : {
      32: "images/private32.png",
    };
  if (!isCurrentTabValidUrlScheme) {
    iconPath = (await getIsFirefoxDefault())
      ? {
        32: "images/firefox32grey.png",
      }
      : {
        32: "images/private32grey.png",
      };
  }

  chrome.action.setIcon({ path: iconPath });
}

// -------------------------------------------
//              Hotkey Logic
// -------------------------------------------
async function handleHotkeyPress(command, tab) {
  if (command === "launchFirefox") {
    await launchFirefox(tab, true);
  } else if (command === "launchFirefoxPrivate") {
    await launchFirefox(tab, false);
  }
}

// -------------------------------------------
//             Event Listeners
// -------------------------------------------
function getIsFirefoxDefault() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["isFirefoxDefault"], (result) => {
      if (result.isFirefoxDefault === undefined) {
        resolve(true);
      } else {
        resolve(result.isFirefoxDefault);
      }
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleContextMenuClick(info, tab);
});

chrome.runtime.onInstalled.addListener(async () => {
  await getIsFirefoxInstalled(); // call this to let the welcome page know if Firefox is installed
  await getIsAutoRedirect(); // resolve to true on fresh install
  chrome.tabs.create({ url: "pages/welcomePage/index.html" });
  await initContextMenu();
  await updateToolbarIcon();
  // dev
  chrome.tabs.create({
    url: "pages/myFirefoxSites/index.html",
  });
});

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    await handleAutoRedirect(details);
    restoreOriginalUrlBeforeRedirect(details.tabId);
  },
  {
    urls: ["<all_urls>"],
    types: ["main_frame"],
  }
);

chrome.storage.sync.onChanged.addListener(async (changes) => {
  if (changes.isFirefoxDefault !== undefined) {
    updateToolbarIcon();
  } else if (changes.firefoxSites !== undefined && await getIsAutoRedirect()) {
    refreshDeclarativeNetRequestRules();
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  launchFirefox(tab, await getIsFirefoxDefault());
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  checkAndUpdateURLScheme(tab);
  updateToolbarIcon();
  updateAddCurrentSiteContextMenu();
});

chrome.tabs.onCreated.addListener(async (tab) => {
  checkAndUpdateURLScheme(tab);
  updateToolbarIcon();
  updateAddCurrentSiteContextMenu();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    checkAndUpdateURLScheme(tab);
    updateToolbarIcon();
    updateAddCurrentSiteContextMenu();
  });
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    handleHotkeyPress(command, tabs[0]);
  });
});

// -------------------------------------------
//              Exports
// -------------------------------------------
chrome.background = {
  launchFirefox,
  checkAndUpdateURLScheme,
  updateToolbarIcon,
  handleHotkeyPress,
  initContextMenu,
  handleContextMenuClick,
  getIsFirefoxDefault,
  getIsFirefoxInstalled,
  setIsCurrentTabValidUrlScheme: (value) => {
    isCurrentTabValidUrlScheme = value;
  },
  getIsCurrentTabValidUrlScheme: () => {
    return isCurrentTabValidUrlScheme;
  },
};
