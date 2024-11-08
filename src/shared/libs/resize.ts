import imageCompression from "browser-image-compression";

export const maxSizeMB = 5;

export const needResize = (file: File) => {
  // check if the file is an image
  if (!file.type.startsWith("image/")) {
    return false;
  }

  // check if the file is greater than maxSizeMB
  return file.size > maxSizeMB * 1024 * 1024;
};

export const resize = async (file: File) => {
  if (!needResize(file)) {
    return file;
  }

  try {
    const compressedFile = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight: 1920,
    });
    return compressedFile;
  } catch (error) {
    console.error(error);
    return file;
  }
};
