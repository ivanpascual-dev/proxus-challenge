import { HttpApi, OpenApi } from "effect/unstable/httpapi";
import { ArtifactsApi } from "./artifacts.ts";
import { AttemptsApi } from "./attempts.ts";
import { MaterialsApi } from "./materials.ts";
import { TutorApi } from "./tutor.ts";

export class ProxusApi extends HttpApi.make("proxus-api")
  .add(TutorApi)
  .add(MaterialsApi)
  .add(ArtifactsApi)
  .add(AttemptsApi)
  .prefix("/api")
  .annotateMerge(OpenApi.annotations({
    title: "Proxus API"
  }))
{}
