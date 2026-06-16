import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { ddb, TableNames } from './client.js';
import { aiConfigKeys } from './keys.js';
import { validateAiConfigInput } from '../study/config.js';
import type { AiConfig, AiConfigInput } from '../study/config.js';

/** Thrown when a VERSION# item already exists (race between concurrent saves). */
export class AiConfigVersionConflictError extends Error {
  constructor() {
    super('AI_CONFIG_VERSION_CONFLICT');
    this.name = 'AiConfigVersionConflictError';
  }
}

/** Thrown when the requested version snapshot does not exist. */
export class AiConfigVersionNotFoundError extends Error {
  constructor() {
    super('AI_CONFIG_VERSION_NOT_FOUND');
    this.name = 'AiConfigVersionNotFoundError';
  }
}

/** Thrown when a revert snapshot fails re-validation (should never happen in practice). */
export class AiConfigRevertInvalidError extends Error {
  constructor(reason: string) {
    super('AI_CONFIG_REVERT_INVALID: ' + reason);
    this.name = 'AiConfigRevertInvalidError';
  }
}

/**
 * Returns the active AI config (CURRENT item) or null when none has been saved.
 * The pk/sk DynamoDB key attributes are stripped before returning.
 */
export async function getCurrentAiConfig(): Promise<AiConfig | null> {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.UserData,
      Key: aiConfigKeys.current(),
    }),
  );
  if (!Item) return null;
  const { pk: _pk, sk: _sk, ...rest } = Item as Record<string, unknown>;
  void _pk;
  void _sk;
  return rest as unknown as AiConfig;
}

/**
 * Saves a new version of the AI config. Atomically writes an immutable
 * VERSION# snapshot (condition: must not already exist) then unconditionally
 * updates CURRENT. Returns the new version number.
 */
export async function saveAiConfig(
  input: AiConfigInput,
  updatedBy: string,
): Promise<{ version: number }> {
  const prev = await ddb.send(
    new GetCommand({
      TableName: TableNames.UserData,
      Key: aiConfigKeys.current(),
    }),
  );
  const prevVersion = (prev.Item?.version as number | undefined) ?? 0;
  const newVersion = prevVersion + 1;
  const updatedAt = new Date().toISOString();

  try {
    await ddb.send(
      new PutCommand({
        TableName: TableNames.UserData,
        Item: { ...aiConfigKeys.version(newVersion), ...input, version: newVersion, updatedBy, updatedAt },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  } catch (err) {
    if (
      err instanceof ConditionalCheckFailedException ||
      (err as { name?: string })?.name === 'ConditionalCheckFailedException'
    ) {
      throw new AiConfigVersionConflictError();
    }
    throw err;
  }

  await ddb.send(
    new PutCommand({
      TableName: TableNames.UserData,
      Item: { ...aiConfigKeys.current(), ...input, version: newVersion, updatedBy, updatedAt },
    }),
  );

  return { version: newVersion };
}

/**
 * Lists all version history items, returned descending by version number
 * (newest first). Each entry contains only version, updatedBy, updatedAt.
 */
export async function listAiConfigVersions(): Promise<
  Array<{ version: number; updatedBy: string; updatedAt: string }>
> {
  const { Items } = await ddb.send(
    new QueryCommand({
      TableName: TableNames.UserData,
      ...aiConfigKeys.listVersions(),
    }),
  );
  const mapped = (Items ?? []).map((item) => ({
    version: item.version as number,
    updatedBy: item.updatedBy as string,
    updatedAt: item.updatedAt as string,
  }));
  return mapped.reverse();
}

/**
 * Returns the immutable snapshot for a specific version number, or null if
 * it does not exist. The pk/sk attributes are stripped before returning.
 */
export async function getAiConfigVersion(seq: number): Promise<AiConfig | null> {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TableNames.UserData,
      Key: aiConfigKeys.version(seq),
    }),
  );
  if (!Item) return null;
  const { pk: _pk, sk: _sk, ...rest } = Item as Record<string, unknown>;
  void _pk;
  void _sk;
  return rest as unknown as AiConfig;
}

/**
 * Reverts the active config to an existing version snapshot. Fetches the
 * snapshot, re-validates it, and calls saveAiConfig() to create a new
 * version with the historical body. Throws AiConfigVersionNotFoundError when
 * the snapshot does not exist, or AiConfigRevertInvalidError when it fails
 * re-validation (should not happen if snapshot was originally valid).
 */
export async function revertAiConfig(
  seq: number,
  updatedBy: string,
): Promise<{ version: number }> {
  const snap = await getAiConfigVersion(seq);
  if (!snap) throw new AiConfigVersionNotFoundError();

  const { version: _v, updatedBy: _ub, updatedAt: _ua, ...body } = snap;
  void _v;
  void _ub;
  void _ua;

  const v = validateAiConfigInput(body);
  if (!v.ok) throw new AiConfigRevertInvalidError(v.error);

  return saveAiConfig(v.value, updatedBy);
}
