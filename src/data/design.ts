export type DesignVariant = "1" | "2" | "3";

const configured = import.meta.env.PUBLIC_DESIGN_VARIANT;

export const designVariant: DesignVariant =
  configured === "2" || configured === "3" ? configured : "1";
