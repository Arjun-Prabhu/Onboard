/**
 * @file AG Grid setup, loaded once by {@link DataGrid}: registers the Enterprise feature set
 * (with AG Charts for integrated charts), applies the license key, and builds a grid theme from
 * Onboard's own color variables so light, dark and high-contrast modes all apply to the grid.
 *
 * Licensing: AG Grid Enterprise and AG Charts Enterprise are commercial. Without a key they still
 * run, but show a "For evaluation only" watermark and a console warning. Put the key in `.env` as
 * `VITE_AG_GRID_LICENSE_KEY` (see docs/credits.md).
 */
import { ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';
import { AgChartsEnterpriseModule } from 'ag-charts-enterprise';

ModuleRegistry.registerModules([AllEnterpriseModule.with(AgChartsEnterpriseModule)]);

const licenseKey = import.meta.env.VITE_AG_GRID_LICENSE_KEY;
if (licenseKey) LicenseManager.setLicenseKey(licenseKey);

/**
 * Onboard's grid theme. Every color is a CSS variable, so switching the app theme restyles the
 * grid with no re-render.
 */
export const gridTheme = themeQuartz.withParams({
  accentColor: 'var(--rh-primary)',
  backgroundColor: 'var(--rh-surface)',
  foregroundColor: 'var(--rh-ink)',
  borderColor: 'var(--rh-line)',
  chromeBackgroundColor: 'var(--rh-surface-2)',
  headerBackgroundColor: 'var(--rh-surface-2)',
  headerTextColor: 'var(--rh-ink)',
  subtleTextColor: 'var(--rh-ink-muted)',
  oddRowBackgroundColor: 'var(--rh-canvas)',
  rowHoverColor: 'var(--rh-primary-soft)',
  selectedRowBackgroundColor: 'var(--rh-primary-soft)',
  fontFamily: 'var(--rh-font-body)',
  headerFontFamily: 'var(--rh-font-body)',
  fontSize: 14,
  headerFontWeight: 600,
  wrapperBorderRadius: 10,
  borderRadius: 6,
  browserColorScheme: 'inherit',
});

/**
 * The AG Charts theme matching the app theme, for integrated charts.
 * @returns A built-in chart theme name.
 */
export function chartThemeName(): string {
  const theme = document.documentElement.dataset.theme;
  return theme === 'dark' || theme === 'contrast' ? 'ag-default-dark' : 'ag-default';
}
