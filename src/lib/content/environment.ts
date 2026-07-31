export function serverEnvironment(name: string): string | undefined {
  const processValue = process.env[name]?.trim();
  if (processValue) return processValue;

  const viteEnvironment = (
    import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }
  ).env;
  const viteValue = viteEnvironment?.[name]?.trim();
  return viteValue || undefined;
}
