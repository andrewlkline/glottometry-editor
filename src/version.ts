/**
 * Build identity, stamped into every exported diagram.
 *
 * A statically hosted tool is a moving target: the URL stays the same while
 * the code behind it changes. If someone publishes a figure made with it,
 * "the version at that address" has to mean something later, so the export
 * records which build drew it.
 *
 * Injected by Vite at build time (see vite.config.ts). The fallbacks keep the
 * module usable when it is imported outside a Vite pipeline.
 */

declare const __APP_VERSION__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

export const APP_NAME = 'glottometry-editor';

export const APP_VERSION =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

export const BUILD_DATE =
  typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : 'unreleased';

/** One line naming the build, for a diagram caption. */
export function versionStamp(): string {
  return `${APP_NAME} v${APP_VERSION} (${BUILD_DATE})`;
}
