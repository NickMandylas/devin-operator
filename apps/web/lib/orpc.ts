import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterContractClient } from "@orpc/contract"
import { contract } from "@superset-devin/contracts"

const link = new RPCLink({ url: "/rpc" })

export const api: RouterContractClient<typeof contract> = createORPCClient(link)
