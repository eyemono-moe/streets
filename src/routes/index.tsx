import type { Component } from "solid-js";
import Columns from "../features/Column/components/Columns";
import Sidebar from "../features/Sidebar/components/Sidebar";

const index: Component = () => {
  return (
    <div class="flex h-svh w-screen divide-x text-zinc-8">
      <Sidebar />
      <Columns />
    </div>
  );
};

export default index;
