import * as request from 'request-promise-native';
import { contains } from '../utils';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject, ProjectManager } from '../projects/ProjectManager';

const URL_BASE = 'https://firestore.googleapis.com/v1beta1';
const instances: { [k: string]: FirestoreAPI } = {};

export class FirestoreAPI {
  static for(account: AccountInfo, project: FirebaseProject): FirestoreAPI {
    const id = account.user.email + '--' + project.projectId;

    if (!contains(instances, id)) {
      instances[id] = new FirestoreAPI(account, project);
    }

    return instances[id];
  }

  projectId: string;
  projectManager: ProjectManager;

  private constructor(account: AccountInfo, project: FirebaseProject) {
    this.projectId = project.projectId;
    this.projectManager = ProjectManager.for(account, project);
  }

  async listCollections(
    path = '',
    pageSize = 300,
    pageToken?: string
  ): Promise<CollectionsList> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'POST',
      url: this.getURLForPath(path) + ':listCollectionIds',
      json: true,
      headers: {
        Authorization: `Bearer ${token.access_token}`
      },
      body: { pageSize, pageToken }
    };

    return request(reqOptions);
  }

  async listDocuments(
    path: string,
    pageSize = 300,
    pageToken?: string
  ): Promise<DocumentsList> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'GET',
      url: this.getURLForPath(path),
      json: true,
      headers: {
        Authorization: `Bearer ${token.access_token}`
      },
      qs: {
        pageSize,
        pageToken,
        showMissing: true,
        'mask.fieldPaths': '_none_'
      }
    };

    const result: InternalDocumentsList = await request(reqOptions);
    result.documents.forEach(processDates);
    return {
      ...result,
      documents: result.documents.map(processDates)
    };
  }

  async getDocument(path: string): Promise<FirestoreDocument> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'GET',
      url: this.getURLForPath(path),
      json: true,
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    };

    const doc: InternalFirestoreDocument = await request(reqOptions);
    return processDates(doc);
  }

  async deleteDocument(path: string): Promise<void> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'DELETE',
      url: this.getURLForPath(path),
      json: true,
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    };

    await request(reqOptions);
  }

  private getURLForPath(path: string): string {
    return `${URL_BASE}/projects/${
      this.projectId
    }/databases/(default)/documents/${path.replace(/^\//, '')}`;
  }
}

function processDates(doc: InternalFirestoreDocument): FirestoreDocument {
  if (doc.createTime) {
    (doc as FirestoreDocument).createTime = new Date(doc.createTime);
  }
  if (doc.updateTime) {
    (doc as FirestoreDocument).updateTime = new Date(doc.updateTime);
  }

  return doc as FirestoreDocument;
}

export function processFieldValue(
  field: DocumentFieldValue
): ProcessedFieldValue {
  if (contains(field, 'nullValue')) {
    return { type: 'null', value: field.nullValue };
  }

  if (contains(field, 'booleanValue')) {
    return { type: 'boolean', value: field.booleanValue };
  }

  if (contains(field, 'integerValue')) {
    return { type: 'integer', value: field.integerValue };
  }

  if (contains(field, 'doubleValue')) {
    return { type: 'double', value: field.doubleValue };
  }

  if (contains(field, 'timestampValue')) {
    return { type: 'timestamp', value: field.timestampValue };
  }

  if (contains(field, 'stringValue')) {
    return { type: 'string', value: field.stringValue };
  }

  if (contains(field, 'bytesValue')) {
    return { type: 'bytes', value: field.bytesValue };
  }

  if (contains(field, 'referenceValue')) {
    return { type: 'reference', value: field.referenceValue };
  }

  if (contains(field, 'geoPointValue')) {
    return { type: 'geopoint', value: field.geoPointValue };
  }

  if (contains(field, 'arrayValue')) {
    return { type: 'array', value: field.arrayValue.values };
  }

  if (contains(field, 'mapValue')) {
    return { type: 'map', value: field.mapValue.fields };
  }

  throw new Error('Unknow field type');
}

export function getFieldArrayValue(
  values: DocumentFieldValue[] | undefined
): any[] | undefined {
  if (!values) {
    return values;
  }

  return values.map(val => {
    const itemVal = processFieldValue(val);
    if (itemVal.type === 'array') {
      return getFieldArrayValue(itemVal.value);
    } else {
      return itemVal.value;
    }
  });
}

export function getFieldValue(field: DocumentFieldValue): any {
  const processed = processFieldValue(field);

  if (processed.type === 'array') {
    return getFieldArrayValue(processed.value);
  } else if (processed.type === 'map') {
    return Object.keys(processed.value)
      .map(
        (childKey): { key: string; val: any } => {
          const childField: DocumentFieldValue = processed.value[childKey];
          return { key: childKey, val: getFieldValue(childField) };
        }
      )
      .reduce(
        (result, item) => {
          result[item.key] = item.val;
          return result;
        },
        {} as { [k: string]: any }
      );
  } else if (processed.type === 'reference') {
    const match = (processed.value as string).match(
      /projects\/([^\/]+)\/databases\/([^\/]+)\/documents(\/.*)/
    );
    if (!match) {
      return '<ERROR>';
    }
    return match[3];
  } else if (processed.type === 'integer') {
    // For some reason integers are returned as strings, but doubles aren't
    return processed.value !== undefined
      ? Number(processed.value)
      : processed.value;
  } else {
    return processed.value;
  }
}

export interface CollectionsList {
  collectionIds: string[];
  nextPageToken?: string;
}

export interface DocumentsList {
  documents: FirestoreDocument[];
  nextPageToken?: string;
}

export interface FirestoreDocument {
  name: string;
  fields?: { [name: string]: DocumentFieldValue };
  createTime?: Date;
  updateTime?: Date;
}

interface InternalDocumentsList {
  documents: InternalFirestoreDocument[];
  nextPageToken?: string;
}

interface InternalFirestoreDocument {
  name: string;
  fields?: { [name: string]: DocumentFieldValue };
  createTime?: string;
  updateTime?: string;
}

// *************************

export type NullValue = null;

export type BooleanValue = boolean;

export type IntegerValue = number;

export type DoubleValue = number;

export type TimestampValue = string;

export type StringValue = string;

export type BytesValue = string;

export type ReferenceValue = string;

export type GeoPointValue = {
  latitude: number;
  longitude: number;
};

export type ArrayValue = {
  values: DocumentFieldValue[];
};

export type MapValue = {
  fields: { [name: string]: DocumentFieldValue };
};

export type FieldValue =
  | NullValue
  | BooleanValue
  | IntegerValue
  | DoubleValue
  | TimestampValue
  | StringValue
  | BytesValue
  | ReferenceValue
  | GeoPointValue
  | ArrayValue['values']
  | MapValue['fields'];

// ***********************

export interface DocumentFieldNullValue {
  nullValue: NullValue;
}

export interface DocumentFieldBooleanValue {
  booleanValue: BooleanValue;
}

export interface DocumentFieldIntegerValue {
  integerValue: IntegerValue;
}

export interface DocumentFieldDoubleValue {
  doubleValue: DoubleValue;
}

export interface DocumentFieldTimestampValue {
  timestampValue: TimestampValue;
}

export interface DocumentFieldStringValue {
  stringValue: StringValue;
}

export interface DocumentFieldBytesValue {
  bytesValue: BytesValue;
}

export interface DocumentFieldReferenceValue {
  referenceValue: ReferenceValue;
}

export interface DocumentFieldGeoPointValue {
  geoPointValue: GeoPointValue;
}

export interface DocumentFieldArrayValue {
  arrayValue: ArrayValue;
}

export interface DocumentFieldMapValue {
  mapValue: MapValue;
}

export type DocumentFieldValue = DocumentFieldNullValue &
  DocumentFieldBooleanValue &
  DocumentFieldIntegerValue &
  DocumentFieldDoubleValue &
  DocumentFieldTimestampValue &
  DocumentFieldStringValue &
  DocumentFieldBytesValue &
  DocumentFieldReferenceValue &
  DocumentFieldGeoPointValue &
  DocumentFieldArrayValue &
  DocumentFieldMapValue;

export type DocumentValueType =
  | 'null'
  | 'boolean'
  | 'integer'
  | 'double'
  | 'timestamp'
  | 'string'
  | 'bytes'
  | 'reference'
  | 'geopoint'
  | 'array'
  | 'map';

export interface ProcessedFieldValueNull {
  type: 'null';
  value: NullValue;
}
export interface ProcessedFieldValueBoolean {
  type: 'boolean';
  value: BooleanValue;
}
export interface ProcessedFieldValueInteger {
  type: 'integer';
  value: IntegerValue;
}
export interface ProcessedFieldValueDouble {
  type: 'double';
  value: DoubleValue;
}
export interface ProcessedFieldValueTimestamp {
  type: 'timestamp';
  value: TimestampValue;
}
export interface ProcessedFieldValueString {
  type: 'string';
  value: StringValue;
}
export interface ProcessedFieldValueBytes {
  type: 'bytes';
  value: BytesValue;
}
export interface ProcessedFieldValueReference {
  type: 'reference';
  value: ReferenceValue;
}
export interface ProcessedFieldValueGeoPoint {
  type: 'geopoint';
  value: GeoPointValue;
}
export interface ProcessedFieldValueArray {
  type: 'array';
  value: ArrayValue['values'] | undefined;
}
export interface ProcessedFieldValueMap {
  type: 'map';
  value: MapValue['fields'];
}

export type ProcessedFieldValue =
  | ProcessedFieldValueNull
  | ProcessedFieldValueBoolean
  | ProcessedFieldValueInteger
  | ProcessedFieldValueDouble
  | ProcessedFieldValueTimestamp
  | ProcessedFieldValueString
  | ProcessedFieldValueBytes
  | ProcessedFieldValueReference
  | ProcessedFieldValueGeoPoint
  | ProcessedFieldValueArray
  | ProcessedFieldValueMap;
