import { Effect, Layer, Schema } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";
import * as AgentCli from "./cli.ts";
import type { AgentSkill } from "./skill.ts";
import { renderSystemPrompt, skillsHelp } from "./system-prompt.ts";

const LoadSkill = Tool.make("load_skill", {
  description: "Load the full instructions for a listed skill by name.",
  parameters: Schema.Struct({
    name: Schema.String
  }),
  success: Schema.String
});

const Cli = Tool.make("cli", {
  description: "Run a CLI command. Use --help on commands to inspect usage, subcommands, and examples.",
  parameters: Schema.Struct({
    input: Schema.String
  }),
  success: Schema.Unknown,
  failure: Schema.String,
  failureMode: "return"
});

export const AgentToolkit = Toolkit.make(LoadSkill, Cli);

export type AgentToolkit = typeof AgentToolkit;

export interface AgentHarness {
  readonly toolkit: AgentToolkit;
  readonly layer: Layer.Layer<Tool.HandlersFor<AgentToolkit["tools"]>>;
  readonly systemPrompt: string;
  readonly skills: readonly AgentSkill[];
  readonly commands: readonly AgentCli.Command[];
  readonly loadSkill: (name: string) => Effect.Effect<string>;
}

export const AgentHarness = {
  // La plantilla es del agente entero, con `{{SKILLS}}` donde quiere el catálogo (fase 4, sección
  // 4.1): un agente sin catálogo de skills no es un agente degradado, es uno que no puede trabajar,
  // y `renderSystemPrompt` falla al construir en vez de dejarlo para producción.
  make: (spec: {
    readonly systemPromptTemplate: string;
    readonly skills: readonly AgentSkill[];
    readonly commands?: readonly AgentCli.Command[];
  }): AgentHarness => {
    const commands = spec.commands ?? [];
    const findSkill = (name: string) => spec.skills.find((skill) => skill.name === name);

    const loadSkill = (name: string) =>
      Effect.succeed(
        findSkill(name)?.content ?? unknownSkillHelp(name, spec.skills)
      );

    const systemPrompt = renderSystemPrompt({
      template: spec.systemPromptTemplate,
      skills: spec.skills
    });

    return {
      toolkit: AgentToolkit,
      layer: AgentToolkit.toLayer({
        load_skill: ({ name }) => loadSkill(name),
        cli: ({ input }) => AgentCli.execute(commands, input).pipe(
          Effect.mapError(AgentCli.renderError)
        )
      }),
      systemPrompt,
      skills: spec.skills,
      commands,
      loadSkill
    };
  }
};

const unknownSkillHelp = (name: string, skills: readonly AgentSkill[]) =>
  `Unknown skill: ${name}\n\nAvailable skills:\n${skillsHelp(skills)}`;
