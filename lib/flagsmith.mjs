import { createHash } from 'node:crypto';

const VARIANT_VALUES = new Map([
  ['control', 'full_source'],
  ['focused_source', 'focused_source'],
]);
export const VARIANTS = [...VARIANT_VALUES.values()];
export const EXPOSURE_EVENT = '$flag_exposure';

function experimentIdFrom(value) {
  const id = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function createPreviewProvider(traffic = 'pilot', previewVariant = '') {
  if (previewVariant && !VARIANTS.includes(previewVariant)) {
    throw new Error('CITETRACE_PREVIEW_VARIANT must be full_source or focused_source');
  }
  return {
    mode: 'preview',
    traffic,
    namespace: `preview:${traffic}${previewVariant ? `:${previewVariant}` : ''}`,
    assign(id) {
      const bucket = createHash('sha256').update(id).digest()[0] % VARIANTS.length;
      return { variant: previewVariant || VARIANTS[bucket], variantKey: null, experimentId: null };
    },
  };
}

export function createFlagsmithProvider({ client, flagName, environmentKey, traffic }) {
  const fingerprint = createHash('sha256').update(environmentKey).digest('hex').slice(0, 12);
  const identify = (id) => `citetrace-${traffic}-${id}`;

  return {
    mode: 'flagsmith',
    traffic,
    namespace: `flagsmith:${traffic}:${fingerprint}:${flagName}`,
    async assign(id) {
      const flags = await client.getIdentityFlags(identify(id));
      const flag = flags.getFlag(flagName);
      const experimentId = experimentIdFrom(flag?.experiment?.id);
      if (!flag?.enabled || flag.isDefault || !flag.experiment?.inExperiment || experimentId === null ||
          !VARIANT_VALUES.has(flag.variant) || VARIANT_VALUES.get(flag.variant) !== flag.value) {
        throw new Error('The Flagsmith flag did not return a supported active experiment assignment');
      }
      return {
        variant: flag.value,
        variantKey: flag.variant,
        experimentId,
      };
    },
    queue(id, eventName, assignment, value) {
      const identifier = identify(id);
      if (eventName === EXPOSURE_EVENT) {
        const metadata = assignment.experiment_id === null ? {} : { experiment_id: Number(assignment.experiment_id) };
        client.trackExposureEvent(flagName, { identifier, value: assignment.variant_key, metadata });
        return;
      }
      client.trackEvent(eventName, { identifier, ...(value === null ? {} : { value }) });
    },
    close: () => client.close(),
  };
}

export async function createProvider(env = process.env) {
  const traffic = env.CITETRACE_TRAFFIC || 'pilot';
  if (!['pilot', 'synthetic'].includes(traffic)) {
    throw new Error('CITETRACE_TRAFFIC must be pilot or synthetic');
  }
  const environmentKey = env.FLAGSMITH_ENVIRONMENT_KEY?.trim();
  const previewVariant = env.CITETRACE_PREVIEW_VARIANT?.trim();
  if (!environmentKey) return createPreviewProvider(traffic, previewVariant);
  if (previewVariant) throw new Error('CITETRACE_PREVIEW_VARIANT requires preview mode');

  const { Flagsmith } = await import('@flagsmith/nodejs');
  const apiUrl = env.FLAGSMITH_API_URL?.trim();
  const eventsApiUrl = env.FLAGSMITH_EVENTS_URL?.trim();
  if (apiUrl && !eventsApiUrl) {
    throw new Error('Set both FLAGSMITH_API_URL and FLAGSMITH_EVENTS_URL when self-hosting');
  }
  const client = new Flagsmith({
    environmentKey,
    enableEvents: true,
    ...(apiUrl ? { apiUrl } : {}),
    ...(eventsApiUrl ? { eventProcessorConfig: { eventsApiUrl } } : {}),
  });

  return createFlagsmithProvider({
    client,
    environmentKey,
    flagName: env.FLAGSMITH_FLAG_NAME || 'citation_opening',
    traffic,
  });
}
