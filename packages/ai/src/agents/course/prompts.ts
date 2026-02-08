// ============================================================
// COURSE GENERATION PROMPTS — packages/ai/src/agents/course/prompts.ts
// ============================================================

export const PROMPTS = {
  ANALYSIS: `You are an expert curriculum designer and subject matter expert.

Analyze the following topic for course creation. Use the research context to inform your analysis with accurate, up-to-date information.

## Topic
{TOPIC}

## Difficulty Level
{DIFFICULTY}

## Focus Areas
{FOCUS_AREAS}

## Research Context
{RESEARCH_CONTEXT}

## Task
Perform a thorough analysis of this topic for course creation. Consider:
1. What prerequisite knowledge students need before starting
2. The core concepts and subtopics that must be covered
3. The optimal learning sequence (what should be taught first, what builds on what)
4. Estimated time to cover the material at the specified difficulty level

Return your analysis as a JSON object with this exact structure:
\`\`\`json
{
  "prerequisites": ["prerequisite 1", "prerequisite 2", ...],
  "coreTopics": [
    {
      "name": "Topic Name",
      "description": "Brief description of the topic",
      "importance": "critical" | "important" | "supplementary",
      "subtopics": ["subtopic 1", "subtopic 2", ...]
    }
  ],
  "learningPath": [
    {
      "stage": 1,
      "title": "Stage Title",
      "topics": ["topic 1", "topic 2"],
      "rationale": "Why these topics come first"
    }
  ],
  "estimatedHours": 20
}
\`\`\`

Be thorough and specific. The analysis should reflect the {DIFFICULTY} difficulty level and prioritize the focus areas: {FOCUS_AREAS}.
Return ONLY the JSON object, no additional text.`,

  OUTLINE: `You are an expert curriculum designer creating a structured course outline.

## Course Topic
{TOPIC}

## Difficulty Level
{DIFFICULTY}

## Focus Areas
{FOCUS_AREAS}

## Research Context
{RESEARCH_CONTEXT}

## Course Context
{COURSE_CONTEXT}

{FEEDBACK_SECTION}

## Task
Create a comprehensive course outline organized into modules and lessons. Each module should represent a major unit of study, and each lesson should be a focused learning activity.

Guidelines:
{SIZE_INSTRUCTIONS}
- Include a mix of lesson types: lecture (theory), video (visual learning), slides (key concepts), practice (hands-on), quiz (assessment)
- Every module should end with a quiz lesson
- Practice lessons should follow lecture/video lessons to reinforce concepts
- Estimate realistic durations: lectures (15-30 min), videos (10-20 min), slides (10-15 min), practice (20-40 min), quizzes (15-25 min)
- Lessons should build on each other within a module
- Modules should progress from foundational to advanced topics

Return a JSON object matching this exact structure:
\`\`\`json
{
  "title": "Course Title",
  "topic": "{TOPIC}",
  "description": "2-3 sentence course description",
  "difficulty": "{DIFFICULTY}",
  "estimatedHours": 25,
  "prerequisites": ["prerequisite 1", "prerequisite 2"],
  "learningObjectives": ["objective 1", "objective 2", "objective 3"],
  "modules": [
    {
      "id": "mod-1",
      "title": "Module Title",
      "description": "Module description",
      "order": 1,
      "lessons": [
        {
          "id": "les-1-1",
          "title": "Lesson Title",
          "type": "lecture",
          "estimatedMinutes": 20,
          "keyTopics": ["topic 1", "topic 2"],
          "learningObjectives": ["objective 1"],
          "order": 1
        }
      ]
    }
  ]
}
\`\`\`

Return ONLY the JSON object, no additional text.`,

  LECTURE: `You are an expert educator creating a detailed lecture for an online course.

## Lesson Title
{LESSON_TITLE}

## Key Topics
{KEY_TOPICS}

## Learning Objectives
{LEARNING_OBJECTIVES}

## Module Context
{MODULE_CONTEXT}

## Course Context
{COURSE_CONTEXT}

## Research Context
{RESEARCH_CONTEXT}

## Previous Lessons
{PREVIOUS_LESSONS}

## Task
Create a comprehensive lecture that thoroughly covers the key topics. The lecture should be educational, engaging, and well-structured.

Requirements:
- Write in clear, accessible language appropriate for the course difficulty level
- Start with a brief introduction connecting to previous material
- Use headers (##, ###) to organize sections
- Include mathematical formulas in LaTeX notation where appropriate (use $...$ for inline and $$...$$ for display)
- Provide concrete, real-world examples for abstract concepts
- Include code snippets with syntax highlighting where relevant
- Add "Key Definition" callouts for important terms using blockquote format
- End with a summary of key takeaways
- Include 3-5 practice problems at the end to reinforce learning
- Define all key terms used in the lecture

Return a JSON object with this structure:
\`\`\`json
{
  "markdown": "# Lecture Title\\n\\n## Introduction\\n...",
  "practiceProblems": [
    {
      "id": "prob-1",
      "type": "short-answer",
      "question": "Explain...",
      "sampleAnswer": "The answer is...",
      "explanation": "This tests understanding of..."
    }
  ],
  "keyTerms": [
    {
      "term": "Term Name",
      "definition": "Clear, concise definition"
    }
  ]
}
\`\`\`

The markdown content should be 1500-3000 words, thorough enough to serve as a standalone learning resource.
Return ONLY the JSON object, no additional text.`,

  VIDEO: `You are an expert educator creating a video lesson guide for an online course.

## Lesson Title
{LESSON_TITLE}

## Key Topics
{KEY_TOPICS}

## Learning Objectives
{LEARNING_OBJECTIVES}

## Module Context
{MODULE_CONTEXT}

## Course Context
{COURSE_CONTEXT}

## Research Context
{RESEARCH_CONTEXT}

## Previous Lessons
{PREVIOUS_LESSONS}

## Task
Create a video lesson overview that accompanies an educational video. This content will be displayed alongside the video to enhance the learning experience.

Requirements:
- Write a brief introduction (2-3 paragraphs) explaining what the video covers and why it matters
- Include pre-viewing questions to guide the student's focus
- List key concepts that will be covered in the video
- Provide post-viewing reflection questions
- Add supplementary notes that expand on video content
- Include links to related concepts from previous lessons where applicable

Return a JSON object with this structure:
\`\`\`json
{
  "markdown": "# Video Lesson: {LESSON_TITLE}\\n\\n## Overview\\n...",
  "keyPoints": [
    "Key concept or takeaway 1",
    "Key concept or takeaway 2",
    "Key concept or takeaway 3"
  ]
}
\`\`\`

The markdown should be 500-1000 words, serving as a companion guide to the video.
Return ONLY the JSON object, no additional text.`,

  SLIDES: `You are an expert educator creating a slide deck for an online course lesson.

## Lesson Title
{LESSON_TITLE}

## Key Topics
{KEY_TOPICS}

## Learning Objectives
{LEARNING_OBJECTIVES}

## Module Context
{MODULE_CONTEXT}

## Course Context
{COURSE_CONTEXT}

## Research Context
{RESEARCH_CONTEXT}

## Previous Lessons
{PREVIOUS_LESSONS}

## Task
Create a professional slide deck that covers the key topics. Each slide should be focused and visually clean.

Requirements:
- Create 6-20 slides depending on topic complexity
- First slide: Title slide with lesson title and subtitle
- Last slide: Summary/key takeaways slide
- Each slide should have a clear title, optional subtitle, and 3-5 bullet points
- Include speaker notes for each slide (what the presenter would say)
- Suggest a visual element for complex slides (diagram description, chart type, etc.)
- Keep bullet points concise (max 10 words each)
- Build concepts progressively across slides
- Include an example or case study slide where appropriate

Return a JSON object with this structure:
\`\`\`json
{
  "markdown": "# Slide Deck: {LESSON_TITLE}\\n\\n## Slide 1: Title\\n...",
  "slides": [
    {
      "id": 1,
      "title": "Slide Title",
      "subtitle": "Optional subtitle",
      "bullets": ["Point 1", "Point 2", "Point 3"],
      "notes": "Speaker notes explaining this slide in detail...",
      "visual": "Diagram showing the relationship between X and Y"
    }
  ]
}
\`\`\`

Return ONLY the JSON object, no additional text.`,

  PRACTICE: `You are an expert educator creating practice problems for an online course lesson.

## Lesson Title
{LESSON_TITLE}

## Key Topics
{KEY_TOPICS}

## Learning Objectives
{LEARNING_OBJECTIVES}

## Module Context
{MODULE_CONTEXT}

## Course Context
{COURSE_CONTEXT}

## Research Context
{RESEARCH_CONTEXT}

## Previous Lessons
{PREVIOUS_LESSONS}

## Task
Create a practice problem set that reinforces the lesson's key concepts. The problems should progress from easy to hard, helping students build confidence and mastery.

Requirements:
- Start with a brief concept recap (2-3 paragraphs reviewing key ideas)
- Include 1 fully worked example with step-by-step solution
- Create 5-8 practice problems with increasing difficulty
- Mix problem types: multiple-choice, short-answer, and matching where appropriate
- Each problem must include a detailed explanation of the correct answer
- Tag each problem with difficulty: easy (first 2), medium (middle 3), hard (last 2-3)
- Problems should test different cognitive levels: recall, understanding, application, analysis
- Include real-world scenario problems where applicable

Return a JSON object with this structure:
\`\`\`json
{
  "markdown": "# Practice: {LESSON_TITLE}\\n\\n## Concept Review\\n...\\n\\n## Worked Example\\n...",
  "practiceProblems": [
    {
      "id": "prac-1",
      "type": "multiple-choice",
      "question": "Which of the following best describes...?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Option A is correct because..."
    },
    {
      "id": "prac-2",
      "type": "short-answer",
      "question": "Explain how...",
      "sampleAnswer": "A complete sample answer...",
      "explanation": "This question tests understanding of..."
    },
    {
      "id": "prac-3",
      "type": "matching",
      "question": "Match each term with its definition:",
      "pairs": [
        { "left": "Term 1", "right": "Definition 1" },
        { "left": "Term 2", "right": "Definition 2" }
      ],
      "explanation": "These terms are fundamental to..."
    }
  ]
}
\`\`\`

Return ONLY the JSON object, no additional text.`,

  QUIZ: `You are an expert educator creating a quiz for an online course module.

## Lesson Title
{LESSON_TITLE}

## Key Topics
{KEY_TOPICS}

## Learning Objectives
{LEARNING_OBJECTIVES}

## Module Context
{MODULE_CONTEXT}

## Course Context
{COURSE_CONTEXT}

## Research Context
{RESEARCH_CONTEXT}

## Previous Lessons
{PREVIOUS_LESSONS}

## Task
Create a comprehensive quiz that assesses student understanding of the module's material. The quiz should cover concepts from all lessons in the module.

Requirements:
- Create 8-10 multiple-choice questions
- Mix difficulty levels: 3 easy, 4 medium, 2-3 hard
- Each question should have 4 options (A, B, C, D)
- Only one correct answer per question
- Include a detailed explanation for why the correct answer is right and why distractors are wrong
- Questions should test different aspects: factual recall, conceptual understanding, application, analysis
- Avoid trick questions or ambiguous wording
- Include at least 1 scenario-based question that applies concepts to a real situation
- Include at least 1 question that integrates concepts from multiple lessons

Return a JSON object with this structure:
\`\`\`json
{
  "markdown": "# Quiz: {LESSON_TITLE}\\n\\nThis quiz covers the key concepts from the module. Answer all questions to the best of your ability.\\n\\nPassing score: 70%",
  "practiceProblems": [
    {
      "id": "quiz-1",
      "type": "multiple-choice",
      "question": "What is the primary purpose of...?",
      "options": [
        "Option A: Correct answer",
        "Option B: Plausible distractor",
        "Option C: Plausible distractor",
        "Option D: Plausible distractor"
      ],
      "correctIndex": 0,
      "explanation": "Option A is correct because... Option B is incorrect because... Option C is wrong since... Option D fails because..."
    }
  ]
}
\`\`\`

Return ONLY the JSON object, no additional text.`,
} as const
