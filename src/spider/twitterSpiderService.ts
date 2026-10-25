/** Re-export: spider tweets live in server Pipetrix; client pulls via serverPipetrixSync. */
export {
  pullServerPipetrixIntoLocal,
  pullServerPipetrixIntoLocal as pullTwitterSpiderIntoPipetrix,
  getServerPipetrixLastPullMs as getTwitterSpiderLastPullMs
} from "../feedtrix/serverPipetrixSync";
