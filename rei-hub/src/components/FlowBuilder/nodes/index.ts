import GreetingNode from './GreetingNode'
import ObjectiveNode from './ObjectiveNode'
import StatementNode from './StatementNode'
import SwitchNode from './SwitchNode'
import TrueFalseNode from './TrueFalseNode'
import ConversationNode from './ConversationNode'
import WebhookNode from './WebhookNode'
import DelayNode from './DelayNode'
import StopNode from './StopNode'
import TransferNode from './TransferNode'

export const nodeTypes = {
  greeting: GreetingNode,
  objective: ObjectiveNode,
  statement: StatementNode,
  switch: SwitchNode,
  true_false: TrueFalseNode,
  conversation: ConversationNode,
  webhook: WebhookNode,
  delay: DelayNode,
  stop: StopNode,
  transfer: TransferNode,
}

export {
  GreetingNode,
  ObjectiveNode,
  StatementNode,
  SwitchNode,
  TrueFalseNode,
  ConversationNode,
  WebhookNode,
  DelayNode,
  StopNode,
  TransferNode,
}
