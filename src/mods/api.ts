import * as yaml from 'js-yaml';
import {
  AccountInfo,
  AccountManager,
  RequestOptions
} from '../accounts/AccountManager';
import { FirebaseProject } from '../projects/ProjectManager';
import { contains } from '../utils';
import { ProjectsAPI, RoleInformation } from '../projects/api';

const CONFIG = {
  version: 'v2',
  origin: 'https://www.googleapis.com/deploymentmanager',
  deploymentPrefix: 'deployment'
};

const instances: { [k: string]: ModsAPI } = {};

export class ModsAPI {
  static for(account: AccountInfo, project: FirebaseProject): ModsAPI {
    const id = account.user.email + '--' + project.projectId;

    if (!contains(instances, id)) {
      instances[id] = new ModsAPI(account, project);
    }

    return instances[id];
  }

  accountManager: AccountManager;

  private constructor(account: AccountInfo, public project: FirebaseProject) {
    this.accountManager = AccountManager.for(account);
  }

  private async request(
    method: string,
    resource: string,
    options: RequestOptions = {}
  ) {
    return this.accountManager.request(
      method,
      `${CONFIG.origin}/${CONFIG.version}/${resource}`,
      options
    );
  }

  async listMods(): Promise<ModDeployment[]> {
    const resource = [
      'projects',
      this.project.projectId,
      'global',
      'deployments'
    ].join('/');

    const response = await this.request('GET', resource, {
      retryOn: [500, 503],
      qs: {
        filter: `name eq ${CONFIG.deploymentPrefix}-.*`
      }
    });

    return (response.body.deployments || []).map((mod: ModDeployment) => {
      mod.nameOriginal = mod.name;
      mod.name = mod.name.replace(`${CONFIG.deploymentPrefix}-`, '');
      return mod;
    });
  }

  async getResources(mod: ModDeployment): Promise<ModResource[]> {
    const resource = [
      'projects',
      this.project.projectId,
      'global',
      'deployments',
      mod.nameOriginal,
      'resources'
    ].join('/');

    const response = await this.request('GET', resource, {
      retryOn: [500, 503]
    });

    let resources = (response.body.resources || []) as ModResource[];
    return resources.map<ModResource>(resource => {
      // Parse YAML properties
      return {
        ...resource,
        properties: yaml.safeLoad(resource.properties as any)
      };
    });
  }

  async getRolesForServiceAccount(
    serviceAccount: ModResourceServiceAccount
  ): Promise<RoleInformation[]> {
    const projectsAPI = ProjectsAPI.for(this.accountManager.account);
    const policy = await projectsAPI.getIamPolicy(this.project);

    const emailMatch = serviceAccount.url.match(/([^\/]+)$/);
    if (!emailMatch || emailMatch.length === 0) {
      return [];
    }

    const email = emailMatch[0];
    const roles: string[] = [];

    policy.bindings.forEach(binding => {
      if (binding.members.includes(`serviceAccount:${email}`)) {
        roles.push(binding.role);
      }
    });

    return Promise.all(roles.map(role => projectsAPI.getRoleInfo(role)));
  }
}

export interface ModDeployment {
  id: number;
  name: string;
  nameOriginal: string;
  description: string;
  operation: { [k: string]: any }; // https://cloud.google.com/deployment-manager/docs/reference/latest/operations#resource
  fingerprint: string; // base64-encoded bytes
  manifest: string;
  update: {
    manifest: string;
    labels: {
      key: string;
      value: string;
    }[];
    description: string;
  };
  insertTime: string;
  updateTime: string;
  target: {
    config: {
      content: string;
    };
    imports: {
      name: string;
      content: string;
    }[];
  };
  labels: {
    key: string;
    value: string;
  }[];
  selfLink: string;
}

export type ModResource =
  | ModResourceFunction
  | ModResourceServiceAccount
  | Exclude<
      // This should exclude the other 2 types, but just falls back to Generic :(
      ModResourceGeneric,
      ModResourceFunction | ModResourceServiceAccount
    >;

export interface ModResourceGeneric {
  id: string;
  name: string;
  type: string;
  properties: {
    // These properties will change depending on the resource type
    [k: string]: any;
  };
  metadata: {
    dependsOn: string[];
  };
}

export interface ModResourceFunction {
  id: string;
  name: string;
  type: 'gcp-types/cloudfunctions-v1:projects.locations.functions';
  manifest: string;
  url: string;
  properties: {
    runtime: string;
    entryPoint: string;
    location: string;
    parent: string;
    function: string;
    sourceUploadUrl: string;
    serviceAccountEmail: string;
    labels: { [k: string]: string };
    environmentVariables: { [k: string]: string };
    httpsTrigger?: {};
    eventTrigger?: {
      eventType: string;
      resource: string;
    };
  };
  metadata: {
    dependsOn: string[];
  };
}

export interface ModResourceServiceAccount {
  id: string;
  name: string;
  type: 'gcp-types/iam-v1:projects.serviceAccounts';
  manifest: string;
  url: string;
  properties: {
    displayName: string;
    accountId: string;
  };
  finalProperties: {
    displayName: string;
    accountId: string;
  };
  inserTime: string;
  updateTime: string;
}
