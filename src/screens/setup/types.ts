/**
 * Types for the first-run Setup flow (SPEC.md §3.7).
 */

export type SetupStep = 'connect' | 'connecting' | 'success' | 'error' | 'openrouter';

export type ConnectMode = 'scan' | 'manual';

export type ErrorVariant = 'unreachable' | 'invalid-token' | 'timeout';

export type ConnectOutcome = 'success' | ErrorVariant;

export interface ConnectFormState {
  host: string;
  token: string;
}

export const emptyConnectForm: ConnectFormState = { host: '', token: '' };


/** The command a VPS-side `pig-bridge pair` run prints, shown copyable in the setup flow. */
export const PAIRING_SETUP_COMMAND = 'pig-bridge pair';
