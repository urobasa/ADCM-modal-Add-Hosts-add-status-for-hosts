// Global cache for host statuses
var adcmHostStatusesCache = null;

// Debug flag: set to true if you need console logs
var ADCM_DEBUG = false;

// Safe debug logger
function adcmLog() {
  if (!ADCM_DEBUG) {
    return;
  }
  var args = Array.prototype.slice.call(arguments);
  args.unshift("[ADCM]");
  console.log.apply(console, args);
}

// Fetch host states from ADCM API v2 (current origin)
async function fetchHostsStatus() {
  var result = {};

  // Build absolute URL to ADCM API
  var path = "/api/v2/hosts/?ordering=name";
  var url = window.location.origin + path;

  adcmLog("=== FETCH HOST STATUSES START ===");
  adcmLog("URL:", url);

  try {
    var response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Accept": "application/json"
      }
    });

    adcmLog("HTTP status for /api/v2/hosts:", response.status);

    if (!response.ok) {
      var textErr = await response.text();
      adcmLog("Request failed, body:", textErr);
      return result;
    }

    var data;
    try {
      data = await response.json();
    } catch (jsonErr) {
      adcmLog("JSON parse error:", jsonErr);
      var raw = await response.text();
      adcmLog("Raw body:", raw);
      return result;
    }

    if (!data || !Array.isArray(data.results)) {
      adcmLog("Unexpected shape of /api/v2/hosts:", data);
      return result;
    }

    for (var i = 0; i < data.results.length; i++) {
      var item = data.results[i];
      if (!item || !item.name) {
        continue;
      }
      var name = item.name;
      var state = item.state || "unknown";
      result[name] = String(state).toUpperCase();
    }

    adcmLog("Built host status map:", result);
  } catch (error) {
    adcmLog("Host status request error:", error);
  }

  adcmLog("=== FETCH HOST STATUSES END ===");
  return result;
}

// Inject CSS for right-aligned status labels
function injectCSS() {
  var style = document.createElement("style");

  style.textContent = [
    ".adcm-host-status-span {",
    "  position: absolute;",
    "  right: 0;",
    "  top: 50%;",
    "  transform: translateY(-50%);",
    "",
    "  color: inherit;",
    "  font-weight: inherit;",
    "  font-family: inherit;",
    "  font-size: inherit;",
    "",
    "  text-transform: uppercase;",
    "  white-space: nowrap;",
    "}",
    "",
    "[data-test='options'] > li {",
    "  position: relative !important;",
    "}"
  ].join("\n");

  document.head.appendChild(style);
  adcmLog("CSS for host statuses injected");
}

// Get current host list <ul> inside modal
function getOptionsList(modalElement) {
  return modalElement.querySelector("[data-test='options']");
}

// Find all host rows inside Add hosts modal
function getHostRows(modalElement) {
  var optionsList = getOptionsList(modalElement);
  if (!optionsList) {
    adcmLog("No [data-test='options'] list found in modal");
    return [];
  }
  return optionsList.querySelectorAll("li");
}

// Extract hostname text from a host row
function getHostnameFromRow(row) {
  // Expected structure:
  // <li>
  //   <label>
  //     <input type="checkbox"> ...
  //     <span>HOSTNAME</span>
  //   </label>
  // </li>

  var labelEl = row.querySelector("label");
  if (!labelEl) {
    return null;
  }

  var spans = labelEl.querySelectorAll("span");
  if (!spans.length) {
    return null;
  }

  var nameElement = spans[spans.length - 1];
  var rawText = (nameElement.textContent || "").trim();
  if (!rawText) {
    return null;
  }

  // Remove " [ STATE ]" suffix if already present
  var index = rawText.indexOf(" [");
  var hostname = index !== -1 ? rawText.substring(0, index).trim() : rawText;

  return hostname;
}

// Apply status to all rows in Add hosts modal
function applyStatusToHosts(modalElement, statuses) {
  if (!statuses) {
    adcmLog("applyStatusToHosts: no statuses cache yet");
    return;
  }

  var hostRows = getHostRows(modalElement);
  adcmLog("applyStatusToHosts: rows in modal =", hostRows.length);

  for (var i = 0; i < hostRows.length; i++) {
    var row = hostRows[i];

    var hostname = getHostnameFromRow(row);
    if (!hostname) {
      continue;
    }

    if (hostname === "All hosts") {
      continue;
    }

    var state = statuses[hostname] || "UNKNOWN";
    var desiredText = " [ " + state + " ]";

    var existing = row.querySelector(".adcm-host-status-span");
    if (existing) {
      if (existing.textContent !== desiredText) {
        existing.textContent = desiredText;
      }
      continue;
    }

    var span = document.createElement("span");
    span.className = "adcm-host-status-span";
    span.textContent = desiredText;
    row.appendChild(span);
  }
}

// Attach observer to current options list to handle filter changes
function attachListObserver(modalElement) {
  var list = getOptionsList(modalElement);
  if (!list) {
    adcmLog("attachListObserver: no options list yet");
    return;
  }

  if (list.getAttribute("data-adcm-status-observed") === "1") {
    adcmLog("List observer already attached");
    return;
  }

  list.setAttribute("data-adcm-status-observed", "1");
  adcmLog("Attaching list observer to host <ul>");

  var listObserver = new MutationObserver(function () {
    adcmLog("Host list mutated, re-applying statuses");
    applyStatusToHosts(modalElement, adcmHostStatusesCache);
  });

  listObserver.observe(list, {
    childList: true,
    subtree: true
  });
}

// Watcher for options list (handles replacement after "No results found")
function attachOptionsListWatcher(modalElement) {
  if (modalElement.getAttribute("data-adcm-options-watcher") === "1") {
    adcmLog("Options list watcher already attached");
    return;
  }

  modalElement.setAttribute("data-adcm-options-watcher", "1");
  adcmLog("Attaching options list watcher on modal");

  var watcher = new MutationObserver(function (mutationsList) {
    var foundNewList = false;

    for (var i = 0; i < mutationsList.length; i++) {
      var mutation = mutationsList[i];

      if (mutation.type !== "childList" || mutation.addedNodes.length === 0) {
        continue;
      }

      for (var j = 0; j < mutation.addedNodes.length; j++) {
        var node = mutation.addedNodes[j];

        if (node.nodeType !== 1) {
          continue;
        }

        if (node.getAttribute && node.getAttribute("data-test") === "options") {
          foundNewList = true;
        } else if (node.querySelector && node.querySelector("[data-test='options']")) {
          foundNewList = true;
        }

        if (foundNewList) {
          break;
        }
      }

      if (foundNewList) {
        break;
      }
    }

    if (foundNewList) {
      adcmLog("New options list detected. Re-attaching list observer and re-applying statuses");
      attachListObserver(modalElement);
      applyStatusToHosts(modalElement, adcmHostStatusesCache);
    }
  });

  watcher.observe(modalElement, {
    childList: true,
    subtree: true
  });
}

// Handle new "Add hosts" modal
async function handleNewModal(modalElement) {
  adcmLog("=== MODAL OPENED ===");

  // 1) If there is no cache yet → mandatory initial fetch
  if (!adcmHostStatusesCache) {
    adcmLog("No cache yet, fetching statuses (initial)...");
    adcmHostStatusesCache = await fetchHostsStatus();
  } else {
    // 2) Cache exists → try to refresh, but keep old cache if refresh failed / empty
    adcmLog("Cache exists, trying to refresh...");
    var freshStatuses = await fetchHostsStatus();

    var hasAnyHost = false;
    for (var key in freshStatuses) {
      if (Object.prototype.hasOwnProperty.call(freshStatuses, key)) {
        hasAnyHost = true;
        break;
      }
    }

    if (hasAnyHost) {
      adcmLog("Refresh succeeded, updating cache");
      adcmHostStatusesCache = freshStatuses;
    } else {
      adcmLog("Refresh failed or empty, keeping previous cache");
    }
  }

  applyStatusToHosts(modalElement, adcmHostStatusesCache);
  attachListObserver(modalElement);
  attachOptionsListWatcher(modalElement);
}

// Detect "Add hosts" modal by data-test and title
function isAddHostsModal(element) {
  if (!element || element.nodeType !== 1) {
    return false;
  }

  if (element.getAttribute("data-test") !== "modal-container") {
    return false;
  }

  var titleElement = element.querySelector("h2");
  if (!titleElement) {
    return false;
  }

  var title = (titleElement.textContent || "").trim();
  return title === "Add hosts";
}

// Observe DOM for Add hosts modal appearance
function observeModals() {
  var observer = new MutationObserver(function (mutationsList) {
    for (var i = 0; i < mutationsList.length; i++) {
      var mutation = mutationsList[i];

      if (mutation.type !== "childList" || mutation.addedNodes.length === 0) {
        continue;
      }

      for (var j = 0; j < mutation.addedNodes.length; j++) {
        var node = mutation.addedNodes[j];

        if (isAddHostsModal(node)) {
          handleNewModal(node);
        }

        if (node.querySelectorAll) {
          var modals = node.querySelectorAll("[data-test='modal-container']");
          for (var k = 0; k < modals.length; k++) {
            if (isAddHostsModal(modals[k])) {
              handleNewModal(modals[k]);
            }
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  adcmLog("Global modal observer started");
}

// Entry point
function main() {
  injectCSS();
  observeModals();
  adcmLog("EXTENSION INIT COMPLETE");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

