import { contains } from '../utils';
import { ModResource, ModResourceFunction, ModResourceServiceAccount } from './api';

// https://cloud.google.com/deployment-manager/docs/configuration/supported-gcp-types
export const GCP_TYPES = {
  'gcp-types/appengine-v1': 'App Engine',
  'gcp-types/accesscontextmanager-v1beta': 'Access Context Manager',
  'gcp-types/bigquery-v2': 'BigQuery',
  'gcp-types/bigtableadmin-v2': 'Cloud Bigtable',
  'gcp-types/cloudbuild-v1': 'Cloud Build',
  'gcp-types/cloudfunctions-v1': 'Cloud Functions',
  'gcp-types/cloudkms-v1': 'Cloud Key Management Service',
  'gcp-types/cloudresourcemanager-v1': 'Resource Manager (v1)',
  'gcp-types/cloudresourcemanager-v2': 'Resource Manager (v2)',
  'gcp-types/compute-alpha': 'Compute Engine (Alpha)',
  'gcp-types/compute-beta': 'Compute Engine (Beta)',
  'gcp-types/compute-v1': 'Compute Engine',
  'gcp-types/container-v1': 'Google Kubernetes Engine',
  'gcp-types/container-v1beta1': 'Google Kubernetes Engine (v1 Beta 1)',
  'gcp-types/dataproc-v1': 'Cloud Dataproc',
  'gcp-types/dns-v1': 'Cloud DNS',
  'gcp-types/file-v1beta1': 'Cloud Filestore',
  'gcp-types/iam-v1': 'Cloud Identity and Access Management',
  'gcp-types/logging-v2': 'Stackdriver Logging',
  'gcp-types/monitoring-v3': 'Stackdriver Monitoring',
  'gcp-types/pubsub-v1': 'Cloud Pub/Sub',
  'gcp-types/redis-v1': 'Cloud Memorystore',
  'gcp-types/redis-v1beta1': 'Cloud Memorystore (v1 Beta 1)',
  'gcp-types/runtimeconfig-v1beta1': 'Cloud Runtime Configuration API',
  'gcp-types/servicemanagement-v1': 'Service Management',
  'gcp-types/spanner-v1': 'Cloud Spanner',
  'gcp-types/sqladmin-v1beta4': 'Cloud SQL (v1 Beta 4)',
  'gcp-types/storage-v1': 'Cloud Storage'
};

export const GCF_EVENT_TYPES = {
  'providers/google.firebase.analytics/eventTypes/event.log': [
    'Analytics',
    'Logged conversion event'
  ],
  'providers/firebase.auth/eventTypes/user.create': ['Auth', 'User Created'],
  'providers/firebase.auth/eventTypes/user.delete': ['Auth', 'User Deleted'],
  'providers/firebase.crashlytics/eventTypes/issue.new': [
    'Crashlytics',
    'New Issue'
  ],
  'providers/firebase.crashlytics/eventTypes/issue.regressed': [
    'Crashlytics',
    'Regression'
  ],
  'providers/firebase.crashlytics/eventTypes/issue.velocityAlert': [
    'Crashlytics',
    'Velocity Alert'
  ],
  'providers/google.firebase.database/eventTypes/ref.write': [
    'Realtime Database',
    'Write'
  ],
  'providers/google.firebase.database/eventTypes/ref.create': [
    'Realtime Database',
    'Create'
  ],
  'providers/google.firebase.database/eventTypes/ref.update': [
    'Realtime Database',
    'Update'
  ],
  'providers/google.firebase.database/eventTypes/ref.delete': [
    'Realtime Database',
    'Delete'
  ],
  'providers/cloud.firestore/eventTypes/document.write': ['Firestore', 'Write'],
  'providers/cloud.firestore/eventTypes/document.create': [
    'Firestore',
    'Create'
  ],
  'providers/cloud.firestore/eventTypes/document.update': [
    'Firestore',
    'Update'
  ],
  'providers/cloud.firestore/eventTypes/document.delete': [
    'Firestore',
    'Delete'
  ],
  'google.pubsub.topic.publish': ['Pub/Sub', 'Publish to topic'],
  'google.storage.object.finalize': [
    'Storage',
    'Finalize (Create / Overwrite)'
  ],
  'google.storage.object.archive': ['Storage', 'Archive'],
  'google.storage.object.delete': ['Storage', 'Delete'],
  'google.storage.object.metadataUpdate': ['Storage', 'Metadata Update'],
  'google.firebase.remoteconfig.update': ['Remote Config', 'Update']
};

export function getResourceTypeName(resourceType: string): string {
  const type = resourceType.split(':')[0];
  return contains(GCP_TYPES, type) ? GCP_TYPES[type] : type;
}

export function getFunctionEventType(eventType: string): string[] {
  if (contains(GCF_EVENT_TYPES, eventType)) {
    return GCF_EVENT_TYPES[eventType];
  } else {
    const match = eventType.match(
      /^(providers\/)?(google\.)?(firebase\.)?([^(\.|\/)]+)\.?(\/eventTypes\/)?(.+)/
    );
    return match ? [match[4], match[6]] : ['Unknown', 'Unknown'];
  }
}

export function isFunctionsResource(
  resource: ModResource
): resource is ModResourceFunction {
  return resource.type.startsWith('gcp-types/cloudfunctions-v1');
}

export function isServiceAccountResource(
  resource: ModResource
): resource is ModResourceServiceAccount {
  return resource.type.startsWith('gcp-types/iam-v1:projects.serviceAccounts');
}
