import { createQueryParser } from "./parseSearchQuery";

export const useQueryParser = () => {
  const parseQuery = createQueryParser();

  return parseQuery;
};
