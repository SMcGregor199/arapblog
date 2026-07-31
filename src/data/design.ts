export type DesignVariant = "1" | "2" | "3";

const configured = import.meta.env.PUBLIC_DESIGN_VARIANT;
const defaultDesignVariant: DesignVariant = "2";

export const designVariant: DesignVariant =
  configured === "1" || configured === "2" || configured === "3"
    ? configured
    : defaultDesignVariant;
