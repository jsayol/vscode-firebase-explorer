import * as request from 'request-promise-native';
import { contains } from '../utils';
import { FirebaseProject, ProjectManager } from '../projects/ProjectManager';
import { AccountInfo } from '../accounts/AccountManager';

const URL_BASE = 'https://firestore.googleapis.com/v1beta1';
const instances: { [k: string]: FirestoreAPI } = {};

export class FirestoreAPI {
  static for(accountInfo: AccountInfo, project: FirebaseProject): FirestoreAPI {
    const id = accountInfo.user.email + '--' + project.projectId;

    if (!contains(instances, id)) {
      instances[id] = new FirestoreAPI(accountInfo, project);
    }

    return instances[id];
  }

  projectId: string;
  projectManager: ProjectManager;

  private constructor(accountInfo: AccountInfo, project: FirebaseProject) {
    this.projectId = project.projectId;
    this.projectManager = ProjectManager.for(accountInfo, project);
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
        Authorization: `Bearer ${token}`
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
        Authorization: `Bearer ${token}`
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
        Authorization: `Bearer ${token}`
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
        Authorization: `Bearer ${token}`
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
    if (processed.value === undefined) {
      return undefined;
    }
    return Object.keys(processed.value)
      .map(
        (childKey): { key: string; val: any } => {
          const childField: DocumentFieldValue = processed.value![childKey];
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
    if (processed.value !== undefined) {
      const match = processed.value.match(
        /projects\/([^\/]+)\/databases\/([^\/]+)\/documents(\/.*)/
      );
      if (!match) {
        return '<ERROR>';
      }
      return match[3];
    } else {
      return undefined;
    }
  } else if (processed.type === 'integer') {
    // For some reason integers are returned as strings, but doubles aren't
    return processed.value !== undefined ? Number(processed.value) : undefined;
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
  values: DocumentFieldValue[] | undefined;
};

export type MapValue = {
  fields: { [name: string]: DocumentFieldValue } | undefined;
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
  | MapValue['fields']
  | undefined;

// ***********************

export interface DocumentFieldNullValue {
  nullValue: NullValue | undefined;
}

export interface DocumentFieldBooleanValue {
  booleanValue: BooleanValue | undefined;
}

export interface DocumentFieldIntegerValue {
  integerValue: IntegerValue | undefined;
}

export interface DocumentFieldDoubleValue {
  doubleValue: DoubleValue | undefined;
}

export interface DocumentFieldTimestampValue {
  timestampValue: TimestampValue | undefined;
}

export interface DocumentFieldStringValue {
  stringValue: StringValue | undefined;
}

export interface DocumentFieldBytesValue {
  bytesValue: BytesValue | undefined;
}

export interface DocumentFieldReferenceValue {
  referenceValue: ReferenceValue | undefined;
}

export interface DocumentFieldGeoPointValue {
  geoPointValue: GeoPointValue | undefined;
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
  value: NullValue | undefined;
}
export interface ProcessedFieldValueBoolean {
  type: 'boolean';
  value: BooleanValue | undefined;
}
export interface ProcessedFieldValueInteger {
  type: 'integer';
  value: IntegerValue | undefined;
}
export interface ProcessedFieldValueDouble {
  type: 'double';
  value: DoubleValue | undefined;
}
export interface ProcessedFieldValueTimestamp {
  type: 'timestamp';
  value: TimestampValue | undefined;
}
export interface ProcessedFieldValueString {
  type: 'string';
  value: StringValue | undefined;
}
export interface ProcessedFieldValueBytes {
  type: 'bytes';
  value: BytesValue | undefined;
}
export interface ProcessedFieldValueReference {
  type: 'reference';
  value: ReferenceValue | undefined;
}
export interface ProcessedFieldValueGeoPoint {
  type: 'geopoint';
  value: GeoPointValue | undefined;
}
export interface ProcessedFieldValueArray {
  type: 'array';
  value: ArrayValue['values'] | undefined;
}
export interface ProcessedFieldValueMap {
  type: 'map';
  value: MapValue['fields'] | undefined;
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
