const roleOrder = ["viewer", "editor", "reviewer", "publisher", "admin"];

const capabilityRoles = {
  manage_content: ["editor", "admin"],
  preview_content: ["editor", "reviewer", "publisher", "admin"],
  review_content: ["reviewer", "admin"],
  publish_content: ["publisher", "admin"],
  manage_recommendations: ["editor", "reviewer", "publisher", "admin"],
  capture_signals_snapshot: ["editor", "reviewer", "admin"],
  run_batch_snapshot: ["admin"],
};

function configuredTokenRoles() {
  const map = new Map();

  const pairs = [
    ["viewer", process.env.OPS_VIEWER_TOKEN],
    ["editor", process.env.OPS_EDITOR_TOKEN],
    ["reviewer", process.env.OPS_REVIEWER_TOKEN],
    ["publisher", process.env.OPS_PUBLISHER_TOKEN],
    ["admin", process.env.OPS_ADMIN_TOKEN],
  ];

  pairs.forEach(([role, token]) => {
    if (token) map.set(token, role);
  });

  return map;
}

function getOpsAuthContext(req) {
  const token = req.headers["x-ops-admin-token"];
  const bindings = configuredTokenRoles();

  if (bindings.size === 0) {
    return {
      ok: false,
      statusCode: 500,
      message: "No OPS_*_TOKEN is configured on server",
      role: null,
      token: null,
    };
  }

  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      message: "Unauthorized",
      role: null,
      token: null,
    };
  }

  const role = bindings.get(token) ?? null;
  if (!role) {
    return {
      ok: false,
      statusCode: 401,
      message: "Unauthorized",
      role: null,
      token: String(token),
    };
  }

  return {
    ok: true,
    statusCode: 200,
    message: "ok",
    role,
    token: String(token),
  };
}

function roleCan(role, capability) {
  const allowed = capabilityRoles[capability] ?? [];
  return allowed.includes(role);
}

function listCapabilitiesForRole(role) {
  return Object.keys(capabilityRoles).filter((capability) => roleCan(role, capability));
}

function requireOpsCapability(req, capability) {
  const auth = getOpsAuthContext(req);
  if (!auth.ok) return auth;

  if (!roleCan(auth.role, capability)) {
    return {
      ok: false,
      statusCode: 403,
      message: `Forbidden: role '${auth.role}' lacks capability '${capability}'`,
      role: auth.role,
      token: auth.token,
    };
  }

  return auth;
}

function requireOpsAdmin(req) {
  return requireOpsCapability(req, "run_batch_snapshot");
}

module.exports = {
  getOpsAuthContext,
  listCapabilitiesForRole,
  requireOpsCapability,
  requireOpsAdmin,
};
