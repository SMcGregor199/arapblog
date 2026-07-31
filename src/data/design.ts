export type DesignVariant = "1" | "2" | "3" | "4";

const configured = import.meta.env.PUBLIC_DESIGN_VARIANT;

export const designVariant: DesignVariant =
  configured === "1" ||
  configured === "2" ||
  configured === "3" ||
  configured === "4"
    ? configured
    : "4";
