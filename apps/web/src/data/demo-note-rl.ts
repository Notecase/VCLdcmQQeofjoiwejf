import type { Note } from '@inkdown/shared'

// ---------------------------------------------------------------------------
// Markdown content for the Reinforcement Learning demo note
// ---------------------------------------------------------------------------

export const DEMO_RL_NOTE_MARKDOWN = `---
title: "Reinforcement Learning: From Foundations to Modern Algorithms"
author: Inkdown Demo
tags: [reinforcement-learning, machine-learning, AI, deep-RL, policy-gradient]
date: 2026-02-09
status: published
---

# Reinforcement Learning: From Foundations to Modern Algorithms

> "Reinforcement learning is learning what to do — how to map situations to actions — so as to maximize a numerical reward signal."
> — *Richard S. Sutton & Andrew G. Barto, Reinforcement Learning: An Introduction*

Reinforcement Learning (RL) is a computational framework where an **agent** learns to make decisions by interacting with an **environment**. Unlike supervised learning, the agent is never told the correct action; it must discover which actions yield the most reward through **trial and error**.

This note covers the mathematical foundations, core algorithms, and modern deep RL methods that have powered breakthroughs from game-playing to robotics.

---

## 1. The Agent-Environment Interface

At each discrete time step $t$, the agent:

1. Observes the current state $s_t \\in \\mathcal{S}$
2. Selects an action $a_t \\in \\mathcal{A}(s_t)$
3. Receives a scalar reward $r_{t+1} \\in \\mathbb{R}$
4. Transitions to a new state $s_{t+1}$

The interaction loop can be visualized as follows:

\`\`\`mermaid
graph LR
    Agent -->|"action a_t"| Environment
    Environment -->|"reward r_{t+1}"| Agent
    Environment -->|"state s_{t+1}"| Agent
\`\`\`

### 1.1 Markov Decision Process

An RL problem is formalized as a **Markov Decision Process** (MDP), defined by the tuple $(\\mathcal{S}, \\mathcal{A}, P, R, \\gamma)$ where:

- $\\mathcal{S}$ — finite set of states
- $\\mathcal{A}$ — finite set of actions
- $P(s' | s, a)$ — state transition probability
- $R(s, a, s')$ — expected immediate reward
- $\\gamma \\in [0, 1]$ — discount factor

The **Markov property** states that the future is conditionally independent of the past given the present:

$$
P(s_{t+1} | s_t, a_t, s_{t-1}, a_{t-1}, \\dots) = P(s_{t+1} | s_t, a_t)
$$

---

## 2. Return, Policies, and Value Functions

### 2.1 Return

The **return** $G_t$ is the total discounted reward from time step $t$ onward:

$$
G_t = r_{t+1} + \\gamma \\, r_{t+2} + \\gamma^2 \\, r_{t+3} + \\cdots = \\sum_{k=0}^{\\infty} \\gamma^k \\, r_{t+k+1}
$$

The discount factor $\\gamma$ controls the trade-off between **immediate** and **future** rewards:

- $\\gamma = 0$ — purely myopic (greedy)
- $\\gamma \\to 1$ — far-sighted (values long-term rewards)

### 2.2 Policy

A **policy** $\\pi$ maps states to a probability distribution over actions:

$$
\\pi(a | s) = P(A_t = a \\mid S_t = s)
$$

Key policy types:

- **Deterministic**: $a = \\mu(s)$
- **Stochastic**: $a \\sim \\pi(\\cdot | s)$
- **$\\varepsilon$-greedy**: With probability $1 - \\varepsilon$ choose $\\arg\\max_a Q(s,a)$, otherwise choose uniformly at random

### 2.3 State-Value Function

The **state-value function** $V^\\pi(s)$ gives the expected return starting from state $s$ and following policy $\\pi$:

$$
V^\\pi(s) = \\mathbb{E}_\\pi \\left[ G_t \\mid S_t = s \\right] = \\mathbb{E}_\\pi \\left[ \\sum_{k=0}^{\\infty} \\gamma^k \\, r_{t+k+1} \\mid S_t = s \\right]
$$

### 2.4 Action-Value Function

The **action-value function** $Q^\\pi(s, a)$ gives the expected return starting from state $s$, taking action $a$, then following $\\pi$:

$$
Q^\\pi(s, a) = \\mathbb{E}_\\pi \\left[ G_t \\mid S_t = s, A_t = a \\right]
$$

### 2.5 Advantage Function

The **advantage function** $A^\\pi(s, a)$ quantifies how much better an action is compared to the average:

$$
A^\\pi(s, a) = Q^\\pi(s, a) - V^\\pi(s)
$$

This is central to modern policy gradient methods like **PPO** and **A2C**.

---

## 3. Bellman Equations

The cornerstone of RL theory. The Bellman equations express a recursive relationship between value functions.

### 3.1 Bellman Expectation Equation

For the state-value function under policy $\\pi$:

$$
V^\\pi(s) = \\sum_a \\pi(a|s) \\sum_{s'} P(s'|s,a) \\left[ R(s,a,s') + \\gamma \\, V^\\pi(s') \\right]
$$

For the action-value function:

$$
Q^\\pi(s,a) = \\sum_{s'} P(s'|s,a) \\left[ R(s,a,s') + \\gamma \\sum_{a'} \\pi(a'|s') \\, Q^\\pi(s', a') \\right]
$$

### 3.2 Bellman Optimality Equation

The **optimal value functions** satisfy:

$$
V^*(s) = \\max_a \\sum_{s'} P(s'|s,a) \\left[ R(s,a,s') + \\gamma \\, V^*(s') \\right]
$$

$$
Q^*(s,a) = \\sum_{s'} P(s'|s,a) \\left[ R(s,a,s') + \\gamma \\max_{a'} Q^*(s', a') \\right]
$$

The optimal policy is then: $\\pi^*(s) = \\arg\\max_a Q^*(s, a)$

> "The Bellman equation averages over all the possibilities, weighting each by its probability of occurring. It states that the value of the start state must equal the (discounted) value of the expected next state, plus the reward expected along the way."[^1]

---

## 4. Temporal-Difference Learning

TD methods learn directly from raw experience **without a model** of the environment. They update estimates based on other learned estimates — a process called **bootstrapping**.

### 4.1 TD(0) Update

The simplest TD method updates $V(s)$ after each transition:

$$
V(S_t) \\leftarrow V(S_t) + \\alpha \\left[ r_{t+1} + \\gamma \\, V(S_{t+1}) - V(S_t) \\right]
$$

where $\\alpha$ is the learning rate and $\\delta_t = r_{t+1} + \\gamma \\, V(S_{t+1}) - V(S_t)$ is the **TD error**.

### 4.2 Q-Learning (Off-Policy)

**Q-Learning** learns the optimal action-value function $Q^*$ regardless of the policy being followed:

$$
Q(S_t, A_t) \\leftarrow Q(S_t, A_t) + \\alpha \\left[ r_{t+1} + \\gamma \\max_a Q(S_{t+1}, a) - Q(S_t, A_t) \\right]
$$

Properties of Q-Learning:

- **Off-policy**: behavior policy can differ from the target policy
- **Convergent**: proven to converge to $Q^*$ under standard stochastic approximation conditions
- Susceptible to **maximization bias** in stochastic environments

\`\`\`python
import numpy as np

class QLearningAgent:
    """Tabular Q-Learning agent for discrete state-action spaces."""

    def __init__(self, n_states: int, n_actions: int, alpha: float = 0.1,
                 gamma: float = 0.99, epsilon: float = 0.1):
        self.q_table = np.zeros((n_states, n_actions))
        self.alpha = alpha
        self.gamma = gamma
        self.epsilon = epsilon

    def select_action(self, state: int) -> int:
        """Epsilon-greedy action selection."""
        if np.random.random() < self.epsilon:
            return np.random.randint(self.q_table.shape[1])
        return int(np.argmax(self.q_table[state]))

    def update(self, state: int, action: int, reward: float, next_state: int) -> float:
        """Apply the Q-Learning update rule. Returns the TD error."""
        best_next = np.max(self.q_table[next_state])
        td_error = reward + self.gamma * best_next - self.q_table[state, action]
        self.q_table[state, action] += self.alpha * td_error
        return td_error

    def train(self, env, n_episodes: int = 1000) -> list[float]:
        """Train the agent on an environment for n_episodes."""
        episode_rewards = []
        for _ in range(n_episodes):
            state, _ = env.reset()
            total_reward = 0.0
            done = False

            while not done:
                action = self.select_action(state)
                next_state, reward, terminated, truncated, _ = env.step(action)
                done = terminated or truncated
                self.update(state, action, reward, next_state)
                state = next_state
                total_reward += reward

            episode_rewards.append(total_reward)
        return episode_rewards
\`\`\`

### 4.3 SARSA (On-Policy)

**SARSA** (State-Action-Reward-State-Action) uses the *actual* next action rather than the greedy maximum:

$$
Q(S_t, A_t) \\leftarrow Q(S_t, A_t) + \\alpha \\left[ r_{t+1} + \\gamma \\, Q(S_{t+1}, A_{t+1}) - Q(S_t, A_t) \\right]
$$

SARSA is more conservative than Q-Learning in environments with penalties (e.g., cliff-walking), because it accounts for the exploration noise in the policy.

---

## 5. Deep Reinforcement Learning

When the state space is large or continuous, we approximate value functions or policies with **neural networks**.

### 5.1 Deep Q-Networks (DQN)

DQN[^2] combines Q-Learning with deep neural networks using two key innovations:

- **Experience Replay**: Store transitions $(s, a, r, s')$ in a replay buffer $\\mathcal{D}$ and sample mini-batches uniformly
- **Target Network**: Use a slowly-updated copy $\\hat{Q}$ to compute TD targets, reducing oscillations

The loss function for DQN:

$$
\\mathcal{L}(\\theta) = \\mathbb{E}_{(s,a,r,s') \\sim \\mathcal{D}} \\left[ \\left( r + \\gamma \\max_{a'} \\hat{Q}(s', a'; \\theta^{-}) - Q(s, a; \\theta) \\right)^2 \\right]
$$

DQN variants and improvements:

- [ ] **Double DQN** — addresses maximization bias by decoupling selection and evaluation
- [ ] **Dueling DQN** — separates state-value and advantage streams
- [x] **Prioritized Experience Replay** — sample transitions proportional to TD error magnitude
- [x] **Rainbow** — combines six extensions into one agent
- [ ] **Distributional DQN (C51)** — learns the full return distribution instead of expected value

### 5.2 Policy Gradient Methods

Instead of learning a value function, **policy gradient** methods directly parameterize the policy $\\pi_\\theta$ and optimize it by gradient ascent on the expected return.

#### Policy Gradient Theorem

The gradient of the expected return with respect to policy parameters $\\theta$:

$$
\\nabla_\\theta J(\\theta) = \\mathbb{E}_{\\pi_\\theta} \\left[ \\sum_{t=0}^{T} \\nabla_\\theta \\log \\pi_\\theta(a_t | s_t) \\, A^{\\pi_\\theta}(s_t, a_t) \\right]
$$

This foundational result enables model-free optimization of stochastic policies.

#### REINFORCE Algorithm

The simplest policy gradient method uses Monte Carlo return estimates:

1. Sample a trajectory $\\tau = (s_0, a_0, r_1, s_1, \\dots)$ under $\\pi_\\theta$
2. Compute the return $G_t$ for each time step
3. Update parameters: $\\theta \\leftarrow \\theta + \\alpha \\sum_t \\nabla_\\theta \\log \\pi_\\theta(a_t | s_t) \\, G_t$

**Problem**: High variance in gradient estimates. Addressed by subtracting a **baseline** $b(s_t)$:

$$
\\nabla_\\theta J(\\theta) \\approx \\frac{1}{N} \\sum_{i=1}^{N} \\sum_{t=0}^{T} \\nabla_\\theta \\log \\pi_\\theta(a_t^i | s_t^i) \\left( G_t^i - b(s_t^i) \\right)
$$

---

## 6. Modern Policy Optimization

### 6.1 Proximal Policy Optimization (PPO)

**PPO**[^3] is the workhorse of modern deep RL. It prevents destructively large policy updates by clipping the probability ratio:

$$
r_t(\\theta) = \\frac{\\pi_\\theta(a_t | s_t)}{\\pi_{\\theta_{\\text{old}}}(a_t | s_t)}
$$

The clipped surrogate objective:

$$
L^{\\text{CLIP}}(\\theta) = \\mathbb{E}_t \\left[ \\min \\left( r_t(\\theta) \\, \\hat{A}_t, \\; \\text{clip}(r_t(\\theta), \\, 1-\\varepsilon, \\, 1+\\varepsilon) \\, \\hat{A}_t \\right) \\right]
$$

where $\\varepsilon$ is typically set to 0.2.

Key properties of PPO:

- Simple to implement
- Good sample efficiency for on-policy methods
- Stable training without careful hyperparameter tuning
- Used in RLHF for large language model alignment (e.g., InstructGPT, ChatGPT)

### 6.2 Soft Actor-Critic (SAC)

**SAC** is an off-policy algorithm that augments the standard RL objective with an **entropy bonus**:

$$
J(\\pi) = \\sum_{t=0}^{T} \\mathbb{E}_{(s_t, a_t) \\sim \\rho_\\pi} \\left[ r(s_t, a_t) + \\alpha \\, \\mathcal{H}(\\pi(\\cdot | s_t)) \\right]
$$

where $\\mathcal{H}(\\pi(\\cdot | s_t)) = -\\sum_a \\pi(a|s_t) \\log \\pi(a|s_t)$ is the entropy of the policy.

Benefits of maximum entropy RL:

- **Exploration**: Higher entropy encourages visiting diverse states
- **Robustness**: Policies that maintain uncertainty are more robust to perturbations
- **Multi-modality**: Can capture multiple near-optimal behaviors

---

## 7. Algorithm Comparison

| Algorithm | Type | Policy | Key Innovation | Sample Efficiency | Stability |
|-----------|------|--------|---------------|-------------------|-----------|
| Q-Learning | Value-based | Off-policy | Bellman optimality bootstrap | Low (tabular) | Moderate |
| SARSA | Value-based | On-policy | Conservative on-policy updates | Low (tabular) | High |
| DQN | Value-based | Off-policy | Experience replay + target net | Moderate | Moderate |
| REINFORCE | Policy gradient | On-policy | Monte Carlo policy gradient | Very low | Low |
| A2C | Actor-Critic | On-policy | Learned baseline (critic) | Moderate | Moderate |
| PPO | Actor-Critic | On-policy | Clipped surrogate objective | Moderate | High |
| SAC | Actor-Critic | Off-policy | Maximum entropy framework | High | High |
| TD3 | Actor-Critic | Off-policy | Twin critics + delayed updates | High | High |

---

## 8. Exploration vs. Exploitation

The fundamental tension in RL: should the agent **exploit** its current knowledge, or **explore** to discover potentially better strategies?

### Exploration Strategies

- **$\\varepsilon$-greedy**: Simple, effective, widely used
- **Boltzmann (softmax)**: $\\pi(a|s) = \\frac{e^{Q(s,a)/\\tau}}{\\sum_{a'} e^{Q(s,a')/\\tau}}$ where $\\tau$ is the temperature
- **Upper Confidence Bound (UCB)**: $a_t = \\arg\\max_a \\left[ Q(s,a) + c \\sqrt{\\frac{\\ln t}{N(s,a)}} \\right]$
- **Intrinsic motivation**: Curiosity-driven exploration via prediction error[^4]
- **Count-based**: Bonus inversely proportional to state visit frequency

### Practical Guidelines

> Exploration schedules matter enormously in practice. A common pattern is to anneal $\\varepsilon$ from 1.0 to 0.01 over the first 10% of training, then hold constant.

---

## 9. Reward Shaping and Engineering

Designing the right reward function is often the hardest part of applying RL to real problems.

Common pitfalls:

1. ~~Sparse rewards work fine for complex tasks~~ — dense rewards are almost always better
2. Reward hacking: the agent finds unintended shortcuts to maximize reward
3. Reward scale sensitivity: algorithms like PPO are sensitive to reward magnitude

### Reward Shaping Theorem

Potential-based reward shaping preserves the optimal policy. Given a potential function $\\Phi(s)$:

$$
R'(s, a, s') = R(s, a, s') + \\gamma \\, \\Phi(s') - \\Phi(s)
$$

This shaped reward $R'$ has the same set of optimal policies as the original reward $R$.

---

## 10. Applications of RL

RL has achieved remarkable results across diverse domains:

- **Game playing**: AlphaGo, AlphaZero (Go, Chess, Shogi)^[5]^
- **Robotics**: Dexterous manipulation, locomotion
- **Natural language**: RLHF for LLM alignment (GPT-4, Claude)
- **Autonomous driving**: Decision-making in complex traffic
- **Resource management**: Data center cooling (DeepMind), chip design
- **Drug discovery**: Molecular optimization via RL-guided search
- **Finance**: Portfolio optimization, algorithmic trading

### RLHF: RL from Human Feedback

A particularly impactful application is **Reinforcement Learning from Human Feedback** (RLHF), used to align language models with human preferences:

1. Collect human preference comparisons on model outputs
2. Train a **reward model** $R_\\phi(x, y)$ to predict human preferences
3. Optimize the language model policy $\\pi_\\theta$ using PPO against the reward model
4. Apply a KL penalty to prevent the policy from diverging too far from the base model

The objective:

$$
\\max_\\theta \\; \\mathbb{E}_{x \\sim \\mathcal{D}, \\, y \\sim \\pi_\\theta(\\cdot|x)} \\left[ R_\\phi(x, y) \\right] - \\beta \\, \\text{KL}\\left[ \\pi_\\theta(\\cdot|x) \\| \\pi_{\\text{ref}}(\\cdot|x) \\right]
$$

---

## 11. Implementation Checklist

A checklist for implementing RL agents in practice:

- [x] Define the state space, action space, and reward function clearly
- [x] Start with a simple baseline (e.g., random policy, tabular Q-Learning)
- [x] Normalize observations and rewards
- [ ] Implement proper logging: episode returns, value loss, policy entropy
- [ ] Use vectorized environments for parallel data collection
- [ ] Tune hyperparameters systematically (learning rate, batch size, $\\gamma$)
- [ ] Monitor for reward hacking and unintended behaviors
- [ ] Test with multiple random seeds (at least 5)
- [ ] Compare against established baselines

---

## 12. Key Hyperparameters

| Hyperparameter | Typical Range | Notes |
|----------------|--------------|-------|
| Learning rate $\\alpha$ | 1e-4 to 3e-4 | Lower for policy gradient methods |
| Discount factor $\\gamma$ | 0.95 to 0.999 | Higher for long-horizon tasks |
| Batch size | 32 to 2048 | Larger batches reduce gradient variance |
| Replay buffer size | 10^5^ to 10^6^ | Off-policy methods only |
| Target network update $\\tau$ | 0.001 to 0.01 | Polyak averaging coefficient |
| Clip range $\\varepsilon$ | 0.1 to 0.3 | PPO-specific |
| Entropy coefficient | 0.001 to 0.01 | Encourages exploration |
| GAE $\\lambda$ | 0.9 to 0.99 | Bias-variance trade-off in advantage estimation |

---

## Further Reading

- [Sutton & Barto — Reinforcement Learning: An Introduction (2nd ed.)](http://incompleteideas.net/book/the-book-2nd.html)
- [OpenAI Spinning Up in Deep RL](https://spinningup.openai.com/)
- [Lilian Weng — A (Long) Peek into Reinforcement Learning](https://lilianweng.github.io/lil-log/2018/02/19/a-long-peek-into-reinforcement-learning.html)
- [Berkeley Deep RL Course (CS 285)](http://rail.eecs.berkeley.edu/deeprlcourse/)

---

[^1]: Sutton, R.S. & Barto, A.G. (2018). *Reinforcement Learning: An Introduction*, 2nd ed., MIT Press.
[^2]: Mnih, V. et al. (2015). "Human-level control through deep reinforcement learning." *Nature*, 518(7540).
[^3]: Schulman, J. et al. (2017). "Proximal Policy Optimization Algorithms." *arXiv:1707.06347*.
[^4]: Pathak, D. et al. (2017). "Curiosity-driven Exploration by Self-Predictive Next Feature Learning." *ICML*.
`

// ---------------------------------------------------------------------------
// Note fixtures
// ---------------------------------------------------------------------------

const TIMESTAMP = '2026-02-09T00:00:00.000Z'

function makeNote(overrides: Partial<Note> & { id: string; title: string; content: string }): Note {
  const text = overrides.content.replace(/[#*`~=>\-[\]|$\\{}()]/g, ' ')
  const words = text.split(/\s+/).filter(Boolean)
  return {
    user_id: 'demo-user',
    project_id: null,
    parent_note_id: null,
    path: `/${overrides.id}`,
    depth: 0,
    content_hash: null,
    word_count: words.length,
    character_count: overrides.content.length,
    reading_time_minutes: Math.max(1, Math.round(words.length / 200)),
    link_count: (overrides.content.match(/\[.*?\]\(.*?\)/g) || []).length,
    attachment_count: 0,
    editor_state: {},
    sort_order: 0,
    tags: [],
    last_viewed_at: TIMESTAMP,
    is_pinned: false,
    is_favorite: false,
    is_archived: false,
    is_deleted: false,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    deleted_at: null,
    version: 1,
    ...overrides,
  }
}

export const DEMO_NOTE: Note = makeNote({
  id: 'demo-note-rl',
  title: 'Reinforcement Learning: From Foundations to Modern Algorithms',
  content: DEMO_RL_NOTE_MARKDOWN,
  tags: ['reinforcement-learning', 'machine-learning', 'AI', 'deep-RL', 'policy-gradient'],
  is_favorite: true,
  sort_order: 0,
})

export const DEMO_PROJECT = {
  id: 'demo-project',
  name: 'AI & Machine Learning',
  user_id: 'demo-user',
} as const

export const DEMO_DOCUMENTS: Note[] = [
  DEMO_NOTE,
  makeNote({
    id: 'demo-note-nn',
    title: 'Neural Network Architectures',
    content: `# Neural Network Architectures

An overview of foundational and modern neural network architectures used in deep learning.

## Feedforward Networks

The simplest architecture: layers of neurons with no cycles. Each layer computes $y = \\sigma(Wx + b)$.

## Convolutional Neural Networks (CNNs)

Designed for grid-like data (images, time series). Key components:

- Convolutional layers with learnable filters
- Pooling layers for spatial down-sampling
- Fully connected classification head

## Recurrent Neural Networks (RNNs)

Process sequential data by maintaining hidden state across time steps. Variants include LSTM and GRU cells.

## Transformers

Self-attention mechanism enables parallel processing of sequences. Foundation of modern LLMs.
`,
    tags: ['neural-networks', 'deep-learning', 'architectures'],
    sort_order: 1,
  }),
  makeNote({
    id: 'demo-note-attention',
    title: 'Attention Mechanisms',
    content: `# Attention Mechanisms

Attention allows models to focus on relevant parts of the input when producing each part of the output.

## Scaled Dot-Product Attention

$$
\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V
$$

## Multi-Head Attention

Projects queries, keys, and values $h$ times with different learned projections, then concatenates.

## Applications

- Machine translation (Bahdanau attention)
- Image captioning (spatial attention)
- Large language models (self-attention)
`,
    tags: ['attention', 'transformers', 'self-attention'],
    sort_order: 2,
  }),
  makeNote({
    id: 'demo-note-loss',
    title: 'Loss Functions & Optimization',
    content: `# Loss Functions & Optimization

A reference for common loss functions and optimization algorithms in deep learning.

## Loss Functions

| Loss | Formula | Use Case |
|------|---------|----------|
| MSE | $\\frac{1}{n}\\sum(y - \\hat{y})^2$ | Regression |
| Cross-Entropy | $-\\sum y \\log \\hat{y}$ | Classification |
| Huber | Combination of MSE and MAE | Robust regression |

## Optimizers

- **SGD**: Simple stochastic gradient descent with optional momentum
- **Adam**: Adaptive learning rates with first and second moment estimates
- **AdamW**: Adam with decoupled weight decay regularization

## Learning Rate Schedules

Common strategies: step decay, cosine annealing, warmup + linear decay, one-cycle policy.
`,
    tags: ['optimization', 'loss-functions', 'gradient-descent'],
    sort_order: 3,
  }),
]
