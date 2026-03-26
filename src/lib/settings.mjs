export const DEFAULT_DENY_RULES = [
  "Read(./.env)",
  "Read(./.env.*)",
  "Read(./secrets/**)",
  "Read(./config/credentials.json)",
  "Read(./*.pem)",
  "Read(./*.key)"
];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function parseSettingsText(text) {
  try {
    return {
      parseable: true,
      object: JSON.parse(text)
    };
  } catch {
    return {
      parseable: false,
      object: null
    };
  }
}

export function summarizeSettingsObject(settingsObject) {
  const object = asObject(settingsObject);
  const permissions = asObject(object.permissions);
  const denyEntries = Array.isArray(permissions.deny) ? permissions.deny.filter((value) => typeof value === "string") : [];
  const topLevelKeys = Object.keys(object).sort();
  const missingDenyRules = DEFAULT_DENY_RULES.filter((rule) => !denyEntries.includes(rule));

  return {
    parseable: true,
    topLevelKeys,
    denyCount: denyEntries.length,
    hasSensitiveDenies: missingDenyRules.length === 0,
    missingDenyRules
  };
}

export function summarizeSettingsText(text) {
  const parsed = parseSettingsText(text);
  if (!parsed.parseable) {
    return {
      parseable: false,
      topLevelKeys: [],
      denyCount: 0,
      hasSensitiveDenies: false,
      missingDenyRules: [...DEFAULT_DENY_RULES]
    };
  }

  return summarizeSettingsObject(parsed.object);
}

export function mergeSettingsObject(existingObject = {}) {
  const merged = structuredClone(asObject(existingObject));
  const permissions = asObject(merged.permissions);
  const denyEntries = Array.isArray(permissions.deny) ? [...permissions.deny] : [];

  for (const rule of DEFAULT_DENY_RULES) {
    if (!denyEntries.includes(rule)) {
      denyEntries.push(rule);
    }
  }

  merged.permissions = {
    ...permissions,
    deny: denyEntries
  };

  return merged;
}

export function renderSettingsJson(settingsObject = mergeSettingsObject({})) {
  return JSON.stringify(settingsObject, null, 2);
}
