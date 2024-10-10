const twitterHostnameRegex = /(\.)?(twitter|x)\.com/i;

export const isTwitterUrl = (url: string): boolean => {
  try {
    const host = new URL(url).hostname;
    return twitterHostnameRegex.test(host);
  } catch {
    return false;
  }
};
