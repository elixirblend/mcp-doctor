interface NpmPackument {
  name: string;
  version: string;
  description?: string;
  bin?: Record<string, string> | string;
  main?: string;
  dependencies?: Record<string, string>;
  repository?: { url?: string } | string;
  mcpName?: string;
}

const NPM_REGISTRY = "https://registry.npmjs.org";

export interface ResolvedPackage {
  name: string;
  version: string;
  description: string;
  installCommand: string;
  installArgs: string[];
  repoUrl: string | null;
}

export async function fetchPackument(pkg: string): Promise<ResolvedPackage> {
  const cleanName = pkg.replace(/^npm:/, "").trim();
  const url = `${NPM_REGISTRY}/${encodeURIComponent(cleanName).replace(/^%40/, "@")}/latest`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Package "${cleanName}" not found on npm`);
    }
    throw new Error(`npm registry returned ${res.status} for ${cleanName}`);
  }
  const data = (await res.json()) as NpmPackument;
  return resolveFromPackument(data);
}

export function resolveFromPackument(data: NpmPackument): ResolvedPackage {
  const installCommand = "npx";
  const installArgs = ["-y", data.name];

  let repoUrl: string | null = null;
  if (typeof data.repository === "string") {
    repoUrl = data.repository;
  } else if (data.repository?.url) {
    repoUrl = data.repository.url;
  }
  if (repoUrl) {
    repoUrl = repoUrl
      .replace(/^git\+/, "")
      .replace(/\.git$/, "")
      .replace(/^git:/, "https:")
      .replace(/^ssh:\/\/git@/, "https://");
    const match = repoUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);
    if (match) {
      repoUrl = `https://github.com/${match[1]}/${match[2]}`;
    } else {
      repoUrl = null;
    }
  }

  return {
    name: data.name,
    version: data.version,
    description: data.description ?? "",
    installCommand,
    installArgs,
    repoUrl,
  };
}
