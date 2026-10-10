import type { Environment } from "./environmentHelpers/environmentHelpers";

/** The fields needed to prove a catalog volume's identity and attachment. */
type Volume = {
  id: string;
  name: string;
  region: string;
  state: string;
  size_gb: number;
  attached_machine_id?: string | null;
};
/** Existing machine layout fields, decoded from the Fly CLI. */
type Machine = {
  id: string;
  region: string;
  state: string;
  config: {
    metadata?: Record<string, string>;
    mounts?: Array<{ volume: string; path: string }>;
  };
};

/** Proves a managed-v2 machine owns this exact catalog and process group. */
function _validateExistingMachine(options: {
  machine: Machine | undefined;
  volume: Volume;
  operator: Environment;
}): void {
  const { machine, volume, operator } = options;
  if (!machine) {
    if (volume.attached_machine_id) {
      throw new Error("Volume is attached to an unlisted machine");
    }
    return;
  }
  const mounts = machine.config.mounts ?? [];
  if (
    machine.region !== operator.FLY_REGION ||
    machine.config.metadata?.fly_platform_version !== "v2" ||
    machine.config.metadata?.fly_process_group !== "app" ||
    mounts.length !== 1 ||
    mounts[0]?.volume !== volume.id ||
    mounts[0]?.path !== operator.FLY_MOUNT_PATH ||
    volume.attached_machine_id !== machine.id
  ) {
    throw new Error(
      "Existing machine must be managed v2 and use the app process group, configured region and exact catalog volume/mount",
    );
  }
}

/** Parses remote data without including the response in errors. */
function _getJsonFromText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Fly returned invalid JSON");
  }
}

/** Narrows untrusted Fly JSON before reading any property. */
function _isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Checks the volume fields this deployment relies on. */
function _isVolume(value: unknown): value is Volume {
  return (
    _isRecord(value) &&
    typeof value.size_gb === "number" &&
    Number.isSafeInteger(value.size_gb) &&
    value.size_gb > 0 &&
    ["id", "name", "region", "state"].every((key) => {
      return typeof value[key] === "string";
    }) &&
    (value.attached_machine_id == null ||
      typeof value.attached_machine_id === "string")
  );
}

/** Checks machine config shape, including every reported catalog mount. */
function _isMachine(value: unknown): value is Machine {
  if (
    !_isRecord(value) ||
    !["id", "region", "state"].every((key) => {
      return typeof value[key] === "string";
    }) ||
    !_isRecord(value.config)
  ) {
    return false;
  }
  const { metadata, mounts } = value.config;
  return (
    (metadata === undefined ||
      (_isRecord(metadata) &&
        Object.values(metadata).every((entry) => {
          return typeof entry === "string";
        }))) &&
    (mounts === undefined ||
      (Array.isArray(mounts) &&
        mounts.every((mount) => {
          return (
            _isRecord(mount) &&
            typeof mount.volume === "string" &&
            typeof mount.path === "string"
          );
        })))
  );
}

/** Refuses every layout that could introduce a second independent catalog. */
export function validateRemoteLayout(options: {
  operator: Environment;
  volumesJson: string;
  machinesJson: string;
}): void {
  const { operator } = options;
  const volumes: unknown = _getJsonFromText(options.volumesJson);
  const machines: unknown = _getJsonFromText(options.machinesJson);
  if (
    !Array.isArray(volumes) ||
    !volumes.every(_isVolume) ||
    !Array.isArray(machines) ||
    !machines.every(_isMachine)
  ) {
    throw new Error("Fly returned an unsupported volume or machine response");
  }
  const catalogs = volumes.filter((volume) => {
    return volume.name === operator.FLY_VOLUME_NAME;
  });
  const volume = catalogs[0];
  if (
    catalogs.length !== 1 ||
    !volume ||
    volume.region !== operator.FLY_REGION ||
    volume.state !== "created"
  ) {
    throw new Error(
      "FLY_VOLUME_NAME, FLY_REGION: require exactly one existing healthy matching volume",
    );
  }
  if (volume.size_gb < Number(operator.FLY_VOLUME_SIZE_GB)) {
    throw new Error(
      "FLY_VOLUME_SIZE_GB: existing volume is below the configured minimum; extend it before deploying",
    );
  }
  if (machines.length > 1) {
    throw new Error(
      "Only one application machine is supported; inspect fly machine list",
    );
  }
  _validateExistingMachine({ machine: machines[0], volume, operator });
}
