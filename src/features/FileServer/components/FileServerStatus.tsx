import type { Component } from "solid-js";
import { useQueryServerConfig } from "../query";

const FileServerStatus: Component<{
  apiUrl: string;
}> = (props) => {
  const serverConfig = useQueryServerConfig(() => props.apiUrl);

  return (
    <div>
      <pre>{JSON.stringify(serverConfig.data, null, 2)}</pre>
    </div>
  );
};

export default FileServerStatus;
