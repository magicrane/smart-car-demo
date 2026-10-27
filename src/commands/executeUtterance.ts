import { parseCommand, type ParsedCommand } from "./commandParser";
import { vehicleController } from "../vehicle/controller";
import type { CommandSource, ControlResult } from "../vehicle/types";

export type UtteranceSource = Extract<CommandSource, "voice" | "text">;

export type UtteranceOutcome = {
  transcript: string;
  parse: ParsedCommand;
  execution: ControlResult | null;
};

export function executeUtterance(text: string, source: UtteranceSource): UtteranceOutcome {
  const transcript = text.trim();
  const parse = parseCommand(transcript);
  if (!parse.ok) {
    return { transcript, parse, execution: null };
  }

  return {
    transcript,
    parse,
    execution: vehicleController.applyCommand(parse.command, source),
  };
}
