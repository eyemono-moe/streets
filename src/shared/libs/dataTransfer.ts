export const getTextOrFile = (dt: DataTransfer): string | File[] | null => {
  const types = dt.types;

  // iOS Safariでは存在しない
  if (!types) return null;

  if (types.includes("Files")) {
    return [...dt.files];
  }

  if (types.includes("text/plain")) {
    return dt.getData("text/plain");
  }

  return null;
};
