import github from "./github.json";
import slack from "./slack.json";
import notion from "./notion.json";
import discord from "./discord.json";
import spotify from "./spotify.json";
import linkedin from "./linkedin.json";
import google from "./google.json";
import meta from "./meta.json";

/** Ordered easy to hard. The library page reads top to bottom as a difficulty ramp. */
export const RAW = [github, slack, notion, discord, spotify, linkedin, google, meta] as unknown[];
