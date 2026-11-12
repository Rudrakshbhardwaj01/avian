/** The minified plotly bundle ships no types; map it to @types/plotly.js. */
declare module "plotly.js-dist-min" {
  export * from "plotly.js";
}
