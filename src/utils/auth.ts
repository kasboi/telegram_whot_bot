import { CommandContext } from "https://deno.land/x/grammy@v1.37.0/mod.ts"
import { MyContext } from "../bot.ts"

// For now, let's assume a simple isAdmin check.
// In a real scenario, this would be more robust.
const authorizedUsers = [674588713] // Replace with actual admin IDs

export const isAdmin = async (ctx: CommandContext<MyContext>): Promise<boolean> => {
    return authorizedUsers.includes(ctx.from?.id || 0)
}