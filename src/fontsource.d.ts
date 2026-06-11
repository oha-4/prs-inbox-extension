// @fontsource-variable/* はCSSのみのパッケージ（型もJSエントリもない）。
// TS6のside-effect import検査(TS2882)向けのambient宣言。実体はviteが解決する。
declare module '@fontsource-variable/*';
