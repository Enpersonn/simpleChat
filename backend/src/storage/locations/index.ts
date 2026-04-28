import { LocationSchema } from "@simplechat/types";
import { BaseStorageObject } from "../base";

export const locations_store = new BaseStorageObject(
  "locations",
  LocationSchema,
);
