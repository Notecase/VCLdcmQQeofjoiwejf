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

> "A neural network is essentially a nonlinear function approximator — its power comes from composing simple units into deep hierarchies."
> — *Ian Goodfellow, Yoshua Bengio & Aaron Courville, Deep Learning*

This note surveys the foundational and modern neural network architectures that underpin deep learning, from simple feedforward networks to transformers. Each section covers the mathematical formulation, key design choices, and practical considerations.

---

## 1. Feedforward Neural Networks (MLPs)

### 1.1 Architecture

A **feedforward network** (or multi-layer perceptron, MLP) consists of an input layer, one or more hidden layers, and an output layer. Information flows in one direction — no cycles.

Each layer $l$ computes an **affine transformation** followed by a **nonlinear activation**:

$$
z^{(l)} = W^{(l)} a^{(l-1)} + b^{(l)}
$$

$$
a^{(l)} = \\sigma(z^{(l)})
$$

where:

- $W^{(l)} \\in \\mathbb{R}^{n_l \\times n_{l-1}}$ — weight matrix
- $b^{(l)} \\in \\mathbb{R}^{n_l}$ — bias vector
- $\\sigma(\\cdot)$ — element-wise activation function (ReLU, GELU, Sigmoid, Tanh)
- $a^{(0)} = x$ — the input vector

### 1.2 Activation Functions

| Function | Formula | Range | Typical Use |
|----------|---------|-------|-------------|
| ReLU | $\\max(0, z)$ | $[0, \\infty)$ | Default for hidden layers |
| Leaky ReLU | $\\max(\\alpha z, z)$ | $(-\\infty, \\infty)$ | Avoids dying ReLU |
| GELU | $z \\cdot \\Phi(z)$ | $(-0.17, \\infty)$ | Transformers, BERT |
| Sigmoid | $\\frac{1}{1 + e^{-z}}$ | $(0, 1)$ | Binary output / gates |
| Tanh | $\\frac{e^z - e^{-z}}{e^z + e^{-z}}$ | $(-1, 1)$ | RNN hidden states |
| Swish / SiLU | $z \\cdot \\sigma(z)$ | $(-0.28, \\infty)$ | EfficientNet, modern CNNs |

### 1.3 Universal Approximation Theorem

A feedforward network with a single hidden layer of sufficient width can approximate any continuous function on a compact subset of $\\mathbb{R}^n$ to arbitrary accuracy (Cybenko 1989, Hornik 1991). Formally, for any continuous $f: [0,1]^n \\to \\mathbb{R}$ and $\\varepsilon > 0$, there exist $N$, weights $W$, biases $b$, and constants $c_i$ such that:

$$
\\left| f(x) - \\sum_{i=1}^{N} c_i \\, \\sigma(w_i^T x + b_i) \\right| < \\varepsilon
$$

> **Caveat**: The theorem guarantees existence but says nothing about learnability via gradient descent or the number of neurons required. In practice, **depth** is more parameter-efficient than width.

### 1.4 Example: Two-Layer MLP in PyTorch

\`\`\`python
import torch
import torch.nn as nn

class MLP(nn.Module):
    def __init__(self, input_dim, hidden_dim, output_dim, dropout=0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, output_dim),
        )

    def forward(self, x):
        return self.net(x)

model = MLP(784, 256, 10)  # MNIST classifier
print(f"Parameters: {sum(p.numel() for p in model.parameters()):,}")
\`\`\`

---

## 2. Convolutional Neural Networks (CNNs)

### 2.1 The Convolution Operation

A 2D convolution with a kernel $K$ of size $k \\times k$ on input feature map $X$ produces output feature map $Y$:

$$
Y[i, j] = \\sum_{m=0}^{k-1} \\sum_{n=0}^{k-1} K[m, n] \\cdot X[i+m, j+n] + b
$$

Key properties that make convolutions effective for spatial data:

- **Parameter sharing** — the same kernel is applied at every position
- **Translation equivariance** — shifting the input shifts the output correspondingly
- **Sparse connectivity** — each output depends only on a local receptive field

### 2.2 Feature Maps and Channels

For a layer with $C_{\\text{in}}$ input channels and $C_{\\text{out}}$ output channels, the learnable parameters consist of $C_{\\text{out}}$ filters, each of shape $C_{\\text{in}} \\times k \\times k$. The total parameter count for one convolutional layer is:

$$
\\text{params} = C_{\\text{out}} \\times (C_{\\text{in}} \\times k \\times k + 1)
$$

The spatial dimensions of the output with stride $s$ and padding $p$ are:

$$
H_{\\text{out}} = \\left\\lfloor \\frac{H_{\\text{in}} + 2p - k}{s} \\right\\rfloor + 1
$$

### 2.3 Pooling

**Max pooling** and **average pooling** reduce spatial resolution, providing a degree of translation invariance:

- **Max pooling**: $\\text{out}[i,j] = \\max_{(m,n) \\in \\mathcal{R}_{ij}} X[m,n]$
- **Average pooling**: $\\text{out}[i,j] = \\frac{1}{|\\mathcal{R}_{ij}|} \\sum_{(m,n) \\in \\mathcal{R}_{ij}} X[m,n]$
- **Global average pooling (GAP)**: Averages over the entire spatial extent — replaces fully connected layers in modern architectures

### 2.4 Landmark CNN Architectures

| Architecture | Year | Depth | Key Innovation | Top-1 Acc (ImageNet) |
|-------------|------|-------|----------------|---------------------|
| LeNet-5 | 1998 | 5 | Foundational CNN for digits | — |
| AlexNet | 2012 | 8 | ReLU, dropout, GPU training | 63.3% |
| VGGNet | 2014 | 16-19 | Small 3×3 filters throughout | 74.4% |
| GoogLeNet | 2014 | 22 | Inception modules (multi-scale) | 74.8% |
| ResNet | 2015 | 50-152 | Residual connections: $y = F(x) + x$ | 76.1% |
| DenseNet | 2017 | 121-264 | Dense connections between layers | 77.2% |
| EfficientNet | 2019 | B0-B7 | Compound scaling (depth×width×resolution) | 84.4% |
| ConvNeXt | 2022 | — | Modernized ResNet rivaling ViT | 87.8% |

### 2.5 Residual Connections

The insight behind **ResNets** is that learning a residual mapping $F(x) = H(x) - x$ is easier than learning $H(x)$ directly:

$$
y = F(x, \\{W_i\\}) + x
$$

This enables training of networks with hundreds of layers by mitigating the vanishing gradient problem. Each residual block provides a "gradient highway" that allows gradients to flow directly to earlier layers.

---

## 3. Recurrent Neural Networks (RNNs)

### 3.1 Vanilla RNN

An RNN maintains a **hidden state** $h_t$ that is updated at each time step:

$$
h_t = \\tanh(W_{hh} \\, h_{t-1} + W_{xh} \\, x_t + b_h)
$$

$$
y_t = W_{hy} \\, h_t + b_y
$$

This gives the network a form of "memory" over the input sequence.

### 3.2 The Vanishing Gradient Problem

During backpropagation through time (BPTT), gradients are multiplied by $W_{hh}$ at each step. For a sequence of length $T$:

$$
\\frac{\\partial h_T}{\\partial h_1} = \\prod_{t=2}^{T} \\frac{\\partial h_t}{\\partial h_{t-1}} = \\prod_{t=2}^{T} \\text{diag}(\\sigma'(z_t)) \\cdot W_{hh}
$$

If the largest singular value of $W_{hh}$ is < 1, gradients **vanish** exponentially. If > 1, they **explode**. This limits vanilla RNNs to capturing only short-range dependencies.

### 3.3 Long Short-Term Memory (LSTM)

LSTMs (Hochreiter & Schmidhuber, 1997) introduce a **cell state** $c_t$ and three **gates** to control information flow:

**Forget gate** — what to discard from the cell state:
$$
f_t = \\sigma(W_f \\cdot [h_{t-1}, x_t] + b_f)
$$

**Input gate** — what new information to store:
$$
i_t = \\sigma(W_i \\cdot [h_{t-1}, x_t] + b_i)
$$

**Candidate cell state**:
$$
\\tilde{c}_t = \\tanh(W_c \\cdot [h_{t-1}, x_t] + b_c)
$$

**Cell state update**:
$$
c_t = f_t \\odot c_{t-1} + i_t \\odot \\tilde{c}_t
$$

**Output gate** — what to output:
$$
o_t = \\sigma(W_o \\cdot [h_{t-1}, x_t] + b_o)
$$

$$
h_t = o_t \\odot \\tanh(c_t)
$$

The cell state acts as a **gradient highway**: when $f_t \\approx 1$, gradients flow through unchanged, enabling learning of long-range dependencies.

### 3.4 Gated Recurrent Unit (GRU)

The GRU (Cho et al., 2014) simplifies the LSTM by merging the cell and hidden state and using two gates:

**Update gate**: $z_t = \\sigma(W_z \\cdot [h_{t-1}, x_t])$

**Reset gate**: $r_t = \\sigma(W_r \\cdot [h_{t-1}, x_t])$

**Candidate state**: $\\tilde{h}_t = \\tanh(W \\cdot [r_t \\odot h_{t-1}, x_t])$

**Hidden state**: $h_t = (1 - z_t) \\odot h_{t-1} + z_t \\odot \\tilde{h}_t$

GRUs have fewer parameters than LSTMs and often achieve comparable performance on many tasks.

---

## 4. Transformer Architecture

### 4.1 Self-Attention

The transformer (Vaswani et al., 2017) replaces recurrence with **self-attention**, allowing each position to attend to all other positions in constant depth:

$$
\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V
$$

where $Q = XW^Q$, $K = XW^K$, $V = XW^V$ are linear projections of the input.

### 4.2 Multi-Head Attention

Instead of a single attention function, the transformer uses $h$ parallel attention heads:

$$
\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h) W^O
$$

$$
\\text{head}_i = \\text{Attention}(QW_i^Q, KW_i^K, VW_i^V)
$$

Each head can learn to attend to different aspects of the input (syntax, semantics, positional patterns, etc.).

### 4.3 Positional Encoding

Since self-attention is permutation-invariant, position information must be injected explicitly. The original sinusoidal encoding:

$$
PE_{(pos, 2i)} = \\sin\\left(\\frac{pos}{10000^{2i/d_{\\text{model}}}}\\right)
$$

$$
PE_{(pos, 2i+1)} = \\cos\\left(\\frac{pos}{10000^{2i/d_{\\text{model}}}}\\right)
$$

Modern variants use **learned positional embeddings** (BERT, GPT) or **rotary positional encoding** (RoPE, used in LLaMA and most recent LLMs).

### 4.4 Encoder-Decoder Structure

The full transformer consists of:

- **Encoder**: $N$ layers of [self-attention → add & norm → FFN → add & norm]
- **Decoder**: $N$ layers of [masked self-attention → add & norm → cross-attention → add & norm → FFN → add & norm]

The encoder processes the input sequence in parallel; the decoder generates output tokens auto-regressively.

### 4.5 Modern Transformer Variants

| Model | Year | Type | Key Innovation | Parameters |
|-------|------|------|----------------|------------|
| BERT | 2018 | Encoder-only | Masked language modeling, bidirectional | 110M–340M |
| GPT-2/3 | 2019/2020 | Decoder-only | Autoregressive LM at scale | 1.5B–175B |
| T5 | 2020 | Encoder-Decoder | Text-to-text framework | 220M–11B |
| Vision Transformer (ViT) | 2020 | Encoder-only | Patch embeddings for images | 86M–632M |
| GPT-4 | 2023 | Decoder-only (MoE) | Multimodal, RLHF alignment | ~1.8T (est.) |
| LLaMA 3 | 2024 | Decoder-only | Open weights, RoPE, GQA | 8B–405B |
| Claude (Opus 4) | 2025 | Decoder-only | Constitutional AI, extended context | — |

---

## 5. Architecture Comparison

| Property | MLP | CNN | RNN / LSTM | Transformer |
|----------|-----|-----|-----------|-------------|
| Input type | Fixed-size vectors | Grid data (images) | Sequences | Sequences / sets |
| Parameter sharing | None | Spatial (kernels) | Temporal (same weights per step) | Attention weights |
| Parallelism | Full | Full | Sequential (per step) | Full |
| Long-range deps | Limited by depth | Limited by receptive field | Challenging (vanishing grad) | Direct (attention) |
| Inductive bias | None | Translation equivariance | Sequential order | Minimal (learned) |
| Typical scale | <10M params | 1M–100M params | 1M–50M params | 100M–1T+ params |
| Strengths | Tabular, simple tasks | Vision, spatial | Time series, speech | NLP, vision, multimodal |

---

## 6. Implementation Checklist

- [ ] **Data pipeline**: Normalize inputs, apply augmentations (CNN), tokenize (Transformer)
- [ ] **Architecture search**: Start with established baselines before customizing
- [ ] **Initialization**: He init for ReLU networks, Xavier for tanh/sigmoid
- [ ] **Batch normalization / Layer normalization**: BatchNorm for CNNs, LayerNorm for Transformers
- [ ] **Residual connections**: Use for any network deeper than ~10 layers
- [ ] **Regularization**: Dropout (0.1–0.3), weight decay, data augmentation
- [ ] **Learning rate**: Warmup + cosine decay for Transformers, step decay for CNNs
- [ ] **Mixed precision**: Use FP16/BF16 for faster training with minimal accuracy loss
- [ ] **Gradient clipping**: Essential for RNNs, recommended for Transformers (max norm 1.0)
- [ ] **Monitoring**: Track train/val loss, gradient norms, learning rate per step

---

## 7. References

1. Cybenko, G. (1989). *Approximation by superpositions of a sigmoidal function.* Mathematics of Control, Signals, and Systems.
2. LeCun, Y. et al. (1998). *Gradient-based learning applied to document recognition.* Proceedings of the IEEE.
3. Hochreiter, S. & Schmidhuber, J. (1997). *Long short-term memory.* Neural Computation.
4. He, K. et al. (2016). *Deep residual learning for image recognition.* CVPR.
5. Vaswani, A. et al. (2017). *Attention is all you need.* NeurIPS.
6. Devlin, J. et al. (2019). *BERT: Pre-training of deep bidirectional transformers for language understanding.* NAACL.
7. Dosovitskiy, A. et al. (2021). *An image is worth 16x16 words: Transformers for image recognition at scale.* ICLR.
8. Tan, M. & Le, Q. (2019). *EfficientNet: Rethinking model scaling for convolutional neural networks.* ICML.
`,
    tags: ['neural-networks', 'deep-learning', 'architectures'],
    sort_order: 1,
  }),
  makeNote({
    id: 'demo-note-attention',
    title: 'Attention Mechanisms',
    content: `# Attention Mechanisms

> "An attention function can be described as mapping a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors."
> — *Vaswani et al., Attention Is All You Need (2017)*

Attention is the core mechanism that allows neural networks to dynamically focus on relevant parts of the input. It has become the foundational building block of modern deep learning, powering everything from machine translation to large language models.

---

## 1. Motivation: The Information Bottleneck

In classical **sequence-to-sequence** models, the encoder compresses an entire input sequence into a single fixed-size context vector $c$:

$$
c = h_T^{\\text{enc}}
$$

This creates an **information bottleneck** — the model must compress arbitrarily long inputs into a vector of fixed dimensionality. Performance degrades significantly as sequence length increases (Cho et al., 2014).

Attention solves this by allowing the decoder to look at **all** encoder hidden states at each decoding step, dynamically selecting which parts of the input are most relevant.

---

## 2. Bahdanau Attention (Additive)

Bahdanau et al. (2015) introduced the first attention mechanism for neural machine translation. At each decoder time step $t$, the model computes:

### 2.1 Alignment Score

An alignment model $a$ computes how well input position $j$ matches output position $t$:

$$
e_{tj} = v_a^T \\tanh(W_a \\, s_{t-1} + U_a \\, h_j)
$$

where:
- $s_{t-1}$ — decoder hidden state at previous step
- $h_j$ — encoder hidden state at position $j$
- $W_a, U_a, v_a$ — learnable parameters

### 2.2 Attention Weights

The alignment scores are normalized via softmax to produce attention weights:

$$
\\alpha_{tj} = \\frac{\\exp(e_{tj})}{\\sum_{k=1}^{T_x} \\exp(e_{tk})}
$$

### 2.3 Context Vector

The context vector is a weighted sum of encoder states:

$$
c_t = \\sum_{j=1}^{T_x} \\alpha_{tj} \\, h_j
$$

This context vector $c_t$ is concatenated with the decoder state and fed into the next decoding step.

> **Key insight**: Different output tokens attend to different input tokens. For example, when translating "the cat sat" to French, the word "chat" attends most strongly to "cat."

---

## 3. Luong Attention (Multiplicative)

Luong et al. (2015) proposed simpler alignment functions that are computationally cheaper:

| Variant | Score Function | Complexity |
|---------|---------------|------------|
| Dot | $e_{tj} = s_t^T h_j$ | $O(d)$ |
| General | $e_{tj} = s_t^T W_a h_j$ | $O(d^2)$ |
| Concat | $e_{tj} = v_a^T \\tanh(W_a [s_t; h_j])$ | $O(d^2)$ |

The **dot-product** variant is fastest but requires encoder and decoder hidden states to have the same dimensionality. The **general** variant introduces a learned bilinear form.

Luong attention also differs from Bahdanau in that it uses the **current** decoder state $s_t$ (not $s_{t-1}$) to compute attention weights.

---

## 4. Scaled Dot-Product Attention

### 4.1 Formulation

The transformer (Vaswani et al., 2017) generalizes attention using **queries**, **keys**, and **values**:

$$
\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V
$$

where:
- $Q \\in \\mathbb{R}^{n \\times d_k}$ — query matrix (what we're looking for)
- $K \\in \\mathbb{R}^{m \\times d_k}$ — key matrix (what's available to match)
- $V \\in \\mathbb{R}^{m \\times d_v}$ — value matrix (the information to retrieve)

### 4.2 Why Scale by $\\sqrt{d_k}$?

For large $d_k$, the dot products $q \\cdot k$ grow in magnitude. Assuming $q$ and $k$ have zero mean and unit variance:

$$
\\text{Var}(q \\cdot k) = \\sum_{i=1}^{d_k} \\text{Var}(q_i \\cdot k_i) = d_k
$$

So the standard deviation of the dot product is $\\sqrt{d_k}$. Without scaling, the softmax would push most of its mass into a single element (saturated softmax), causing **vanishing gradients**. Dividing by $\\sqrt{d_k}$ normalizes the variance to 1, keeping the softmax in its sensitive region.

### 4.3 Attention as Soft Lookup

Attention can be understood as a **differentiable dictionary lookup**:

1. Compute similarity between each query and all keys → $QK^T$
2. Normalize to get a probability distribution → softmax
3. Return a weighted combination of values → multiply by $V$

When the softmax is sharply peaked ("hard attention"), this approximates a discrete lookup. When it's diffuse ("soft attention"), it blends information from multiple sources.

---

## 5. Multi-Head Attention

### 5.1 Formulation

Instead of performing a single attention function, the transformer projects $Q$, $K$, $V$ into $h$ different subspaces:

$$
\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h) \\, W^O
$$

$$
\\text{head}_i = \\text{Attention}(Q W_i^Q, \\; K W_i^K, \\; V W_i^V)
$$

where $W_i^Q \\in \\mathbb{R}^{d_{\\text{model}} \\times d_k}$, $W_i^K \\in \\mathbb{R}^{d_{\\text{model}} \\times d_k}$, $W_i^V \\in \\mathbb{R}^{d_{\\text{model}} \\times d_v}$, $W^O \\in \\mathbb{R}^{hd_v \\times d_{\\text{model}}}$.

### 5.2 Parameter Count

With $h$ heads and $d_k = d_v = d_{\\text{model}} / h$:

$$
\\text{Params}_{\\text{MHA}} = 4 \\cdot d_{\\text{model}}^2
$$

(Three projection matrices $W^Q, W^K, W^V$ plus one output matrix $W^O$, each of size $d_{\\text{model}} \\times d_{\\text{model}}$.)

### 5.3 Why Multiple Heads?

Each head operates on a different learned projection, allowing the model to jointly attend to information from different representation subspaces:

- **Head A** might track syntactic dependencies (subject-verb agreement)
- **Head B** might capture semantic similarity
- **Head C** might focus on positional proximity

This is analogous to having multiple "filters" in a CNN, each detecting a different pattern.

---

## 6. Positional Encoding

### 6.1 The Problem

Self-attention is **permutation equivariant** — it treats the input as a set, not a sequence. Without position information, "the cat sat on the mat" and "mat the on sat cat the" would produce identical representations.

### 6.2 Sinusoidal Encoding (Vaswani et al.)

The original transformer uses deterministic sinusoidal functions:

$$
PE_{(pos, 2i)} = \\sin\\left(\\frac{pos}{10000^{2i / d_{\\text{model}}}}\\right)
$$

$$
PE_{(pos, 2i+1)} = \\cos\\left(\\frac{pos}{10000^{2i / d_{\\text{model}}}}\\right)
$$

Properties:
- Each dimension corresponds to a sinusoid with a different wavelength
- The model can learn to attend to relative positions because $PE_{pos+k}$ can be represented as a linear function of $PE_{pos}$
- Generalizes to sequence lengths not seen during training

### 6.3 Learned Positional Embeddings

BERT and GPT use learned position embeddings — a trainable matrix $E_{\\text{pos}} \\in \\mathbb{R}^{L_{\\max} \\times d}$ where $L_{\\max}$ is the maximum sequence length. Simple and effective, but cannot extrapolate beyond the training length.

### 6.4 Rotary Positional Encoding (RoPE)

RoPE (Su et al., 2021) encodes position by rotating the query and key vectors:

$$
f(x, m) = \\begin{pmatrix} x_1 \\\\ x_2 \\end{pmatrix} \\otimes \\begin{pmatrix} \\cos m\\theta \\\\ \\sin m\\theta \\end{pmatrix}
$$

This ensures that the dot product $\\langle f(q, m), f(k, n) \\rangle$ depends only on the **relative** position $m - n$, providing elegant length extrapolation. Used in LLaMA, Mistral, and most modern LLMs.

---

## 7. Self-Attention vs. Cross-Attention

| Property | Self-Attention | Cross-Attention |
|----------|---------------|-----------------|
| Q, K, V source | All from same sequence | Q from one, K/V from another |
| Used in | Encoder, decoder (masked) | Decoder (attending to encoder) |
| Purpose | Capture dependencies within a sequence | Align information between sequences |
| Example | Word relationships in a sentence | Translation: target attends to source |

---

## 8. Efficient Attention Variants

Standard attention has $O(n^2)$ time and memory complexity, which becomes prohibitive for long sequences. Several methods address this:

### 8.1 Flash Attention (Dao et al., 2022)

Flash Attention doesn't change the computation — it computes **exact** standard attention — but restructures the algorithm for GPU memory efficiency:

- Uses **tiling** to compute attention in blocks that fit in SRAM
- Never materializes the full $n \\times n$ attention matrix in HBM
- Achieves 2-4x speedup and significant memory savings
- Now the default in most training frameworks (PyTorch 2.0+)

### 8.2 Other Efficient Attention Methods

| Method | Complexity | Approach |
|--------|-----------|----------|
| Sparse Attention | $O(n\\sqrt{n})$ | Attend to fixed sparse patterns |
| Linear Attention | $O(n)$ | Kernel approximation of softmax |
| Linformer | $O(n)$ | Project K, V to lower dimension |
| Performer | $O(n)$ | Random feature approximation (FAVOR+) |
| Longformer | $O(n)$ | Sliding window + global tokens |
| Multi-Query Attention | $O(n^2)$ | Shared K, V across heads (faster inference) |
| Grouped-Query Attention | $O(n^2)$ | K, V shared within groups of heads |

---

## 9. Code Example: Attention from Scratch

\`\`\`python
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class ScaledDotProductAttention(nn.Module):
    def forward(self, Q, K, V, mask=None):
        d_k = Q.size(-1)
        scores = torch.matmul(Q, K.transpose(-2, -1)) / math.sqrt(d_k)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float('-inf'))
        attn_weights = F.softmax(scores, dim=-1)
        return torch.matmul(attn_weights, V), attn_weights

class MultiHeadAttention(nn.Module):
    def __init__(self, d_model, n_heads):
        super().__init__()
        assert d_model % n_heads == 0
        self.d_k = d_model // n_heads
        self.n_heads = n_heads
        self.W_q = nn.Linear(d_model, d_model)
        self.W_k = nn.Linear(d_model, d_model)
        self.W_v = nn.Linear(d_model, d_model)
        self.W_o = nn.Linear(d_model, d_model)
        self.attention = ScaledDotProductAttention()

    def forward(self, Q, K, V, mask=None):
        batch_size = Q.size(0)
        # Project and reshape to (batch, heads, seq_len, d_k)
        Q = self.W_q(Q).view(batch_size, -1, self.n_heads, self.d_k).transpose(1, 2)
        K = self.W_k(K).view(batch_size, -1, self.n_heads, self.d_k).transpose(1, 2)
        V = self.W_v(V).view(batch_size, -1, self.n_heads, self.d_k).transpose(1, 2)
        # Apply attention
        out, weights = self.attention(Q, K, V, mask)
        # Concatenate heads and project
        out = out.transpose(1, 2).contiguous().view(batch_size, -1, self.n_heads * self.d_k)
        return self.W_o(out)

# Example usage
mha = MultiHeadAttention(d_model=512, n_heads=8)
x = torch.randn(2, 10, 512)  # (batch=2, seq_len=10, d_model=512)
output = mha(x, x, x)         # Self-attention
print(output.shape)            # torch.Size([2, 10, 512])
\`\`\`

---

## 10. Applications of Attention

| Domain | Attention Type | Example Models |
|--------|---------------|---------------|
| Machine Translation | Cross-attention (encoder-decoder) | Transformer, mBART |
| Language Modeling | Causal self-attention | GPT, LLaMA, Claude |
| Text Understanding | Bidirectional self-attention | BERT, RoBERTa |
| Image Classification | Self-attention on patches | ViT, DeiT, Swin |
| Object Detection | Cross-attention (query → image features) | DETR |
| Speech Recognition | Self + cross attention | Whisper, Conformer |
| Protein Folding | Axial attention, triangular attention | AlphaFold 2 |
| Image Generation | Cross-attention (text → image) | Stable Diffusion, DALL-E |
| Multimodal | Cross-attention across modalities | Flamingo, LLaVA |

---

## 11. Key Papers

1. Bahdanau, D. et al. (2015). *Neural machine translation by jointly learning to align and translate.* ICLR.
2. Luong, M.-T. et al. (2015). *Effective approaches to attention-based neural machine translation.* EMNLP.
3. Vaswani, A. et al. (2017). *Attention is all you need.* NeurIPS.
4. Su, J. et al. (2021). *RoFormer: Enhanced transformer with rotary position embedding.* arXiv.
5. Dao, T. et al. (2022). *FlashAttention: Fast and memory-efficient exact attention with IO-awareness.* NeurIPS.
6. Shazeer, N. (2019). *Fast transformer decoding: One write-head is all you need.* arXiv. (Multi-Query Attention)
7. Ainslie, J. et al. (2023). *GQA: Training generalized multi-query transformer models from multi-head checkpoints.* EMNLP.
`,
    tags: ['attention', 'transformers', 'self-attention'],
    sort_order: 2,
  }),
  makeNote({
    id: 'demo-note-loss',
    title: 'Loss Functions & Optimization',
    content: `# Loss Functions & Optimization

> "The choice of loss function and optimizer can make or break a deep learning project — they define *what* the model learns and *how efficiently* it learns."

This note provides a comprehensive reference for loss functions, optimization algorithms, and learning rate schedules used in modern deep learning. Each section includes mathematical formulations, practical guidelines, and implementation details.

---

## 1. Loss Function Taxonomy

Loss functions measure the discrepancy between model predictions $\\hat{y}$ and ground truth $y$. They fall into three broad categories:

| Category | Goal | Examples |
|----------|------|---------|
| **Regression** | Predict continuous values | MSE, MAE, Huber, Log-Cosh |
| **Classification** | Predict discrete labels | Cross-Entropy, Focal Loss, Hinge |
| **Metric Learning** | Learn similarity embeddings | Contrastive, Triplet, InfoNCE |

The choice depends on the task, data distribution, and robustness requirements.

---

## 2. Regression Losses

### 2.1 Mean Squared Error (MSE / L2 Loss)

$$
\\mathcal{L}_{\\text{MSE}} = \\frac{1}{n} \\sum_{i=1}^{n} (y_i - \\hat{y}_i)^2
$$

- **Gradient**: $\\frac{\\partial \\mathcal{L}}{\\partial \\hat{y}_i} = \\frac{2}{n}(\\hat{y}_i - y_i)$ — gradient is proportional to error magnitude
- **Properties**: Differentiable everywhere, strongly penalizes large errors (quadratic penalty)
- **When to use**: Clean data, Gaussian noise assumption, when large errors should be heavily penalized
- **Drawback**: Sensitive to **outliers** — a single large error dominates the loss

### 2.2 Mean Absolute Error (MAE / L1 Loss)

$$
\\mathcal{L}_{\\text{MAE}} = \\frac{1}{n} \\sum_{i=1}^{n} |y_i - \\hat{y}_i|
$$

- **Gradient**: $\\frac{\\partial \\mathcal{L}}{\\partial \\hat{y}_i} = \\frac{1}{n} \\text{sign}(\\hat{y}_i - y_i)$ — constant magnitude, regardless of error size
- **Properties**: More robust to outliers than MSE, but gradient is discontinuous at zero
- **When to use**: Data with outliers, median regression, when all errors should contribute equally
- **Drawback**: Non-smooth at zero can slow convergence

### 2.3 Huber Loss (Smooth L1)

Combines the best of MSE and MAE with a threshold $\\delta$:

$$
\\mathcal{L}_{\\text{Huber}} = \\begin{cases} \\frac{1}{2}(y - \\hat{y})^2 & \\text{if } |y - \\hat{y}| \\leq \\delta \\\\ \\delta \\cdot |y - \\hat{y}| - \\frac{1}{2}\\delta^2 & \\text{otherwise} \\end{cases}
$$

- **Behavior**: Quadratic for small errors (like MSE), linear for large errors (like MAE)
- **Gradient**: Smooth everywhere, bounded for large errors
- **When to use**: Regression with occasional outliers, reinforcement learning (DQN uses $\\delta = 1$)

### 2.4 Comparison

| Property | MSE | MAE | Huber |
|----------|-----|-----|-------|
| Outlier robustness | Low | High | Tunable ($\\delta$) |
| Smoothness | Smooth | Non-smooth at 0 | Smooth |
| Gradient behavior | Proportional to error | Constant | Bounded |
| Optimal prediction | Mean | Median | Between mean & median |
| Convergence speed | Fast (near minimum) | Slower | Fast |

---

## 3. Classification Losses

### 3.1 Binary Cross-Entropy

For binary classification with predicted probability $\\hat{y} = \\sigma(z) \\in (0, 1)$:

$$
\\mathcal{L}_{\\text{BCE}} = -\\frac{1}{n} \\sum_{i=1}^{n} \\left[ y_i \\log \\hat{y}_i + (1 - y_i) \\log(1 - \\hat{y}_i) \\right]
$$

**Derivation from KL divergence**: Cross-entropy between true distribution $p$ and predicted distribution $q$ is:

$$
H(p, q) = -\\sum_x p(x) \\log q(x) = H(p) + D_{\\text{KL}}(p \\| q)
$$

Since $H(p)$ is constant with respect to model parameters, minimizing cross-entropy is equivalent to minimizing the **KL divergence** $D_{\\text{KL}}(p \\| q)$.

### 3.2 Categorical Cross-Entropy

For multi-class classification with $C$ classes and softmax output $\\hat{y}_c = \\frac{e^{z_c}}{\\sum_j e^{z_j}}$:

$$
\\mathcal{L}_{\\text{CE}} = -\\sum_{c=1}^{C} y_c \\log \\hat{y}_c = -\\log \\hat{y}_{\\text{true}}
$$

where $y$ is a one-hot vector. In practice, the **log-softmax** formulation is used for numerical stability:

$$
\\log \\hat{y}_c = z_c - \\log\\left(\\sum_j e^{z_j}\\right)
$$

**Gradient** (clean and simple):

$$
\\frac{\\partial \\mathcal{L}}{\\partial z_c} = \\hat{y}_c - y_c
$$

### 3.3 Focal Loss

Lin et al. (2017) introduced focal loss to address **class imbalance** in object detection:

$$
\\mathcal{L}_{\\text{focal}} = -\\alpha_t (1 - \\hat{y}_t)^\\gamma \\log(\\hat{y}_t)
$$

where:
- $\\hat{y}_t$ — predicted probability for the true class
- $\\alpha_t$ — class-balancing weight
- $\\gamma$ — focusing parameter (typically $\\gamma = 2$)

The term $(1 - \\hat{y}_t)^\\gamma$ **down-weights well-classified examples**, forcing the model to focus on hard, misclassified cases. When $\\gamma = 0$, focal loss reduces to standard cross-entropy.

| $\\hat{y}_t$ (confidence) | CE Loss | Focal ($\\gamma=2$) | Reduction Factor |
|--------------------------|---------|---------------------|-----------------|
| 0.9 (easy) | 0.105 | 0.001 | 100x |
| 0.5 (moderate) | 0.693 | 0.173 | 4x |
| 0.1 (hard) | 2.303 | 1.865 | 1.2x |

---

## 4. Metric Learning Losses

### 4.1 Contrastive Loss

For learning embeddings where similar pairs should be close and dissimilar pairs far apart:

$$
\\mathcal{L}_{\\text{contrastive}} = (1 - y) \\cdot \\frac{1}{2} d^2 + y \\cdot \\frac{1}{2} \\max(0, m - d)^2
$$

where $d = \\|f(x_1) - f(x_2)\\|_2$ is the embedding distance, $y = 1$ for negative pairs, and $m$ is the margin.

### 4.2 Triplet Loss

Given an anchor $a$, positive $p$, and negative $n$:

$$
\\mathcal{L}_{\\text{triplet}} = \\max\\left(0, \\; \\|f(a) - f(p)\\|_2^2 - \\|f(a) - f(n)\\|_2^2 + m\\right)
$$

The loss pushes the anchor closer to the positive and away from the negative by at least margin $m$. **Hard negative mining** is essential for effective training — selecting negatives that are close to the anchor.

### 4.3 InfoNCE / NT-Xent

The loss used in contrastive learning (SimCLR, CLIP):

$$
\\mathcal{L}_{\\text{InfoNCE}} = -\\log \\frac{\\exp(\\text{sim}(z_i, z_j) / \\tau)}{\\sum_{k=1}^{2N} \\mathbb{1}_{k \\neq i} \\exp(\\text{sim}(z_i, z_k) / \\tau)}
$$

where $\\tau$ is a temperature parameter and $\\text{sim}$ is cosine similarity.

---

## 5. Stochastic Gradient Descent (SGD)

### 5.1 Vanilla SGD

The simplest optimizer — update parameters in the negative gradient direction:

$$
\\theta_{t+1} = \\theta_t - \\eta \\, \\nabla_{\\theta} \\mathcal{L}(\\theta_t)
$$

where $\\eta$ is the learning rate and the gradient is computed on a mini-batch.

### 5.2 SGD with Momentum

Accumulates a velocity vector to accelerate convergence and dampen oscillations:

$$
v_t = \\mu \\, v_{t-1} + \\nabla_{\\theta} \\mathcal{L}(\\theta_t)
$$

$$
\\theta_{t+1} = \\theta_t - \\eta \\, v_t
$$

where $\\mu \\in [0, 1)$ is the momentum coefficient (typically $\\mu = 0.9$). Momentum helps the optimizer traverse flat regions faster and reduces oscillation in narrow valleys.

### 5.3 Nesterov Accelerated Gradient (NAG)

A lookahead variant that evaluates the gradient at the anticipated next position:

$$
v_t = \\mu \\, v_{t-1} + \\nabla_{\\theta} \\mathcal{L}(\\theta_t - \\eta \\mu v_{t-1})
$$

$$
\\theta_{t+1} = \\theta_t - \\eta \\, v_t
$$

NAG converges faster than standard momentum on convex problems and often works better in practice for training deep networks.

---

## 6. Adaptive Learning Rate Methods

### 6.1 Adam (Kingma & Ba, 2015)

Adam maintains exponential moving averages of the first and second moments of gradients:

**First moment** (mean): $m_t = \\beta_1 m_{t-1} + (1 - \\beta_1) g_t$

**Second moment** (uncentered variance): $v_t = \\beta_2 v_{t-1} + (1 - \\beta_2) g_t^2$

**Bias correction** (critical for early steps):

$$
\\hat{m}_t = \\frac{m_t}{1 - \\beta_1^t}, \\quad \\hat{v}_t = \\frac{v_t}{1 - \\beta_2^t}
$$

**Parameter update**:

$$
\\theta_{t+1} = \\theta_t - \\eta \\cdot \\frac{\\hat{m}_t}{\\sqrt{\\hat{v}_t} + \\varepsilon}
$$

Default hyperparameters: $\\beta_1 = 0.9$, $\\beta_2 = 0.999$, $\\varepsilon = 10^{-8}$.

### 6.2 AdamW (Loshchilov & Hutter, 2019)

Standard Adam applies weight decay inside the gradient, which is incorrect when using adaptive learning rates. AdamW **decouples** weight decay from the gradient update:

$$
\\theta_{t+1} = \\theta_t - \\eta \\left( \\frac{\\hat{m}_t}{\\sqrt{\\hat{v}_t} + \\varepsilon} + \\lambda \\theta_t \\right)
$$

where $\\lambda$ is the weight decay coefficient. This is now the **default optimizer for training transformers** (typical $\\lambda = 0.01$–$0.1$).

### 6.3 Weight Decay vs. L2 Regularization

These are equivalent for SGD but **different for adaptive methods**:

| Aspect | L2 Regularization | Weight Decay (Decoupled) |
|--------|-------------------|--------------------------|
| Loss modification | $\\mathcal{L}' = \\mathcal{L} + \\frac{\\lambda}{2}\\|\\theta\\|^2$ | None — applied directly to update |
| Gradient | $g_t + \\lambda\\theta_t$ | $g_t$ (decay is separate) |
| Effect with Adam | Decay scaled by $1/\\sqrt{\\hat{v}_t}$ (inconsistent) | Uniform decay across parameters |
| Recommendation | Use with SGD | Use with Adam (AdamW) |

---

## 7. Learning Rate Schedules

The learning rate is often the **single most important hyperparameter**. Schedules adjust it during training for better convergence.

### 7.1 Step Decay

Reduce the learning rate by a factor at fixed intervals:

$$
\\eta_t = \\eta_0 \\cdot \\gamma^{\\lfloor t / s \\rfloor}
$$

where $\\gamma = 0.1$ and $s$ is the step size (e.g., every 30 epochs). Simple but requires manual tuning.

### 7.2 Cosine Annealing

Smoothly decays the learning rate following a cosine curve:

$$
\\eta_t = \\eta_{\\min} + \\frac{1}{2}(\\eta_{\\max} - \\eta_{\\min})\\left(1 + \\cos\\left(\\frac{t}{T}\\pi\\right)\\right)
$$

Widely used for training CNNs and transformers. Provides a smooth transition without sharp drops.

### 7.3 Warmup + Linear Decay

The standard schedule for transformer training:

$$
\\eta_t = \\begin{cases} \\eta_{\\max} \\cdot \\frac{t}{T_{\\text{warmup}}} & \\text{if } t < T_{\\text{warmup}} \\\\ \\eta_{\\max} \\cdot \\frac{T - t}{T - T_{\\text{warmup}}} & \\text{otherwise} \\end{cases}
$$

**Warmup** prevents early instability when Adam's moment estimates are poorly initialized. Typical warmup: 1-5% of total steps.

### 7.4 OneCycleLR (Smith & Topin, 2019)

A single cycle from low → high → low learning rate, combined with inverse momentum schedule:

1. Warmup: $\\eta_{\\min} \\to \\eta_{\\max}$ over first 30% of training
2. Annealing: $\\eta_{\\max} \\to \\eta_{\\min}/25$ over remaining 70%

Often achieves faster convergence in fewer epochs ("super-convergence").

---

## 8. Gradient Clipping

Prevents **exploding gradients** by constraining gradient norms before the optimizer step.

### 8.1 Clip by Global Norm (most common)

$$
\\hat{g} = \\begin{cases} g & \\text{if } \\|g\\| \\leq c \\\\ c \\cdot \\frac{g}{\\|g\\|} & \\text{otherwise} \\end{cases}
$$

Preserves gradient direction while bounding magnitude. Typical threshold: $c = 1.0$.

### 8.2 Clip by Value

$$
\\hat{g}_i = \\text{clip}(g_i, -c, c)
$$

Clips each gradient element independently. Simpler but can change gradient direction.

---

## 9. Code Example: Custom Training Loop

\`\`\`python
import torch
import torch.nn as nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingWarmRestarts

# Model, loss, optimizer
model = nn.Sequential(
    nn.Linear(784, 512),
    nn.GELU(),
    nn.Dropout(0.1),
    nn.Linear(512, 256),
    nn.GELU(),
    nn.Dropout(0.1),
    nn.Linear(256, 10),
)
criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
optimizer = AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)
scheduler = CosineAnnealingWarmRestarts(optimizer, T_0=10, T_mult=2)

# Training loop
for epoch in range(100):
    model.train()
    total_loss = 0
    for batch_x, batch_y in train_loader:
        optimizer.zero_grad()
        logits = model(batch_x)
        loss = criterion(logits, batch_y)
        loss.backward()
        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()
        total_loss += loss.item()
    scheduler.step()
    avg_loss = total_loss / len(train_loader)
    print(f"Epoch {epoch+1}: loss={avg_loss:.4f}, lr={scheduler.get_last_lr()[0]:.6f}")
\`\`\`

---

## 10. Optimizer Comparison

| Optimizer | Adaptive LR | Momentum | Memory | Best For |
|-----------|------------|----------|--------|----------|
| SGD | No | Optional | $O(n)$ or $O(2n)$ | CNNs, well-tuned pipelines |
| SGD + Nesterov | No | Yes (lookahead) | $O(2n)$ | Convex and CNN training |
| AdaGrad | Yes (per-param) | No | $O(2n)$ | Sparse gradients (NLP embeddings) |
| RMSProp | Yes | Optional | $O(2n)$ | RNNs, non-stationary objectives |
| Adam | Yes | Yes (1st + 2nd moment) | $O(3n)$ | General default, small datasets |
| AdamW | Yes | Yes (decoupled decay) | $O(3n)$ | **Transformers** (standard choice) |
| LAMB | Yes | Yes | $O(3n)$ | Large-batch training |
| Lion | Sign-based | Yes | $O(2n)$ | Memory-efficient alternative to Adam |

---

## 11. Practical Guidelines Checklist

### Loss Selection
- [ ] **Regression**: Start with MSE; switch to Huber if data has outliers
- [ ] **Classification**: Use cross-entropy with **label smoothing** (0.1) to improve calibration
- [ ] **Imbalanced classes**: Consider focal loss ($\\gamma = 2$) or class-weighted cross-entropy
- [ ] **Embeddings**: Triplet loss with hard negative mining or InfoNCE with large batch sizes

### Optimizer Selection
- [ ] **Default**: AdamW with $\\text{lr} = 3 \\times 10^{-4}$, $\\beta_1 = 0.9$, $\\beta_2 = 0.999$, $\\lambda = 0.01$
- [ ] **CNNs at scale**: SGD + Nesterov momentum (0.9) often generalizes better
- [ ] **Fine-tuning**: Lower learning rate ($10^{-5}$–$10^{-4}$), fewer epochs
- [ ] **Large batch**: Use LAMB or scale LR linearly with batch size

### Learning Rate
- [ ] **Transformers**: Warmup (1-5% of steps) + cosine decay
- [ ] **CNNs**: Step decay (divide by 10 every 30 epochs) or cosine annealing
- [ ] **Finding max LR**: Use the LR range test (Smith, 2017) — sweep LR from $10^{-7}$ to $10$ over one epoch
- [ ] **Rule of thumb**: If loss diverges, halve the LR; if loss plateaus too early, double it

### Stability
- [ ] **Always clip gradients** for RNNs and Transformers (max norm 1.0)
- [ ] **Monitor gradient norms** — sudden spikes indicate instability
- [ ] **Use mixed precision** (BF16 preferred over FP16 for stability) with loss scaling
- [ ] **Verify loss is decreasing** in the first 100 steps — if not, the LR is likely too high

---

## 12. References

1. Kingma, D.P. & Ba, J. (2015). *Adam: A method for stochastic optimization.* ICLR.
2. Loshchilov, I. & Hutter, F. (2019). *Decoupled weight decay regularization.* ICLR.
3. Lin, T.-Y. et al. (2017). *Focal loss for dense object detection.* ICCV.
4. Smith, L.N. (2017). *Cyclical learning rates for training neural networks.* WACV.
5. Smith, L.N. & Topin, N. (2019). *Super-convergence: Very fast training using large learning rates.* arXiv.
6. You, Y. et al. (2020). *Large batch optimization for deep learning: Training BERT in 76 minutes.* ICLR. (LAMB)
7. Chen, X. et al. (2023). *Symbolic discovery of optimization algorithms.* NeurIPS. (Lion)
8. Schraudolph, N. (1999). *A fast, compact approximation of the exponential function.* Neural Computation.
`,
    tags: ['optimization', 'loss-functions', 'gradient-descent'],
    sort_order: 3,
  }),
]
