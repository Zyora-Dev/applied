export const progressLabels = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
} as const;

export type WeekStatus = keyof typeof progressLabels;
export type WeekProgress = { week: number; status: WeekStatus; updated_at: string | null };
export type CourseProgress = { weeks: WeekProgress[] };

export const courseWeeks = [
  {
    title: "Course overview, onboarding & PyTorch",
    description: "Begin with an overview of the four-week programme and student onboarding, then explore PyTorch fundamentals.",
    topics: ["Four-week overview", "Student onboarding", "Tensors & gradients", "Dataset & DataLoader"],
    outcomes: ["Understand the four-week learning plan, session format and individual project expectations.", "Complete student registration, sign in and verify your profile and course access.", "Explain and run a forward pass, loss calculation, backward pass and optimizer step in the later PyTorch session."],
    sessions: [
      {
        title: "Day 1: Four-week Overview & Student Onboarding", format: "Monday, 28 September 2026 / In person",
        theory: "General overview of the four-week Applied AI programme: PyTorch, data validation, evaluation, Transformers, RAG and the final individual project. Discuss the class schedule, learning expectations, deliverables and admin-marked weekly progress.",
        practical: "Complete registration or sign in with your existing student account, verify your profile, and explore the dashboard and all four week details. Discuss preparation for upcoming classes and resolve onboarding questions.",
        output: "Student account access confirmed, profile details checked and a clear understanding of the four-week class plan and individual project expectations. No dataset-validation lab is required on Day 1.",
        timing: "2-hour session: programme overview, student onboarding and questions",
      },
      {
        title: "Understand PyTorch Building Blocks", format: "Friday/Saturday / Google Meet",
        theory: "Tensors, shapes, devices, gradients, loss functions and optimizers; how a training step changes model parameters.",
        practical: "Create tensors, inspect gradients and use Dataset/DataLoader. Run a tiny neural network with the course starter notebook.",
        output: "Working forward/backward pass and a short explanation of the training loop.",
        timing: "10 min recap + 30 min theory + 65 min lab + 15 min checkpoint",
      },
    ],
    tasks: ["Complete student onboarding and confirm that you can sign in and access the course.", "Review the four-week plan, check your profile details and raise any questions during orientation.", "After the later PyTorch session, complete and rerun the notebook; explain each training step."],
    deliverables: ["Student onboarding and profile verification", "Four-week learning plan reviewed", "PyTorch notebook after the later practical session"],
    materials: ["Four-week programme roadmap", "Student dashboard and weekly course details", "PyTorch starter notebook for the later session"],
  },
  {
    title: "Evaluation & Transformers",
    description: "Evaluate a classifier, explore pretrained Transformers and define your individual document-based project.",
    topics: ["Precision, recall & F1", "Model evaluation", "Transformers", "Hugging Face"],
    outcomes: ["Compare a classifier with a baseline using appropriate metrics.", "Distinguish model selection on validation data from final test evaluation.", "Run pretrained inference and explain tokenization, context limits and model limitations."],
    sessions: [
      {
        title: "Train, Measure and Improve", format: "Monday / In person",
        theory: "Epochs, batches, overfitting, evaluation mode, accuracy, precision, recall and F1; why accuracy alone can mislead.",
        practical: "Train a small classifier on validated data, compare a simple baseline, inspect loss and a confusion matrix, and save model weights.",
        output: "Baseline comparison, validation metrics and error examples. Select using validation data, then report the held-out test result.",
        timing: "15 min review + 25 min theory + 65 min lab + 15 min discussion",
      },
      {
        title: "Use Transformers with Hugging Face", format: "Friday/Saturday / Google Meet",
        theory: "Tokens, embeddings, attention intuition, context limits, encoder/decoder roles and pretrained inference versus fine-tuning.",
        practical: "Inspect a model card and license. Load a tokenizer and small pretrained model through Transformers, run a text task and inspect failures.",
        output: "Inference notebook, model-choice note and individual capstone topic.",
        timing: "10 min recap + 35 min theory + 60 min lab + 15 min project brief",
      },
    ],
    tasks: ["Report baseline and classifier metrics with representative errors.", "Run pretrained inference and record the model ID, license and limitations.", "Define your project problem, collect approved documents and draft evaluation questions."],
    deliverables: ["Classifier notebook and evaluation results", "Transformers inference notebook and model-choice note", "Individual project brief, approved documents and draft questions"],
    materials: ["Validated Week 1 dataset", "Classifier starter notebook", "Pretrained model card and tokenizer", "Approved engineering documents"],
  },
  {
    title: "Retrieval-augmented generation",
    description: "Build a searchable document collection and generate grounded answers with supporting source references.",
    topics: ["Document chunking", "Embeddings", "Top-k retrieval", "Grounded answers"],
    outcomes: ["Build a searchable collection with source/page metadata.", "Connect retrieval to a pretrained instruction model.", "Distinguish supporting evidence from a citation and abstain when documents cannot answer."],
    sessions: [
      {
        title: "Prepare Documents and Build Retrieval", format: "Monday / In person",
        theory: "Why RAG is useful; documents, chunks, embeddings, similarity, top-k retrieval and RAG versus model training.",
        practical: "Extract readable text from approved documents, retain source/page metadata, split into chunks, embed and index them.",
        output: "Searchable document collection with source-linked results. Begin with a small in-memory index; FAISS is an optional extension.",
        timing: "10 min recap + 30 min theory + 65 min lab + 15 min checkpoint",
      },
      {
        title: "Generate Grounded Answers", format: "Friday/Saturday / Google Meet",
        theory: "Retrieved context, prompt structure, grounded answers, hallucinations and the difference between a citation and supporting evidence.",
        practical: "Connect retrieval to a small instruction model, show source references and test missing-information questions with an explicit abstention response.",
        output: "End-to-end RAG notebook with source references and missing-answer handling.",
        timing: "10 min recap + 25 min theory + 65 min lab + 20 min project review",
      },
    ],
    tasks: ["Use the same embedding model for documents and questions; preserve source references.", "Test ten questions: six factual, two multi-passage and two unanswerable.", "Log incorrect retrieval, unsupported claims and weak citations separately."],
    deliverables: ["Working individual RAG notebook", "Ten-question evaluation set", "Initial failure log and source manifest"],
    materials: ["Approved text-based documents", "Embedding model and small instruction model", "RAG starter notebook", "Ten-question evaluation template"],
  },
  {
    title: "Project quality & presentation",
    description: "Evaluate and improve your project, verify its evidence, and present your individual final demonstration.",
    topics: ["Retrieval evaluation", "Citation quality", "Responsible AI", "Final demonstration"],
    outcomes: ["Measure retrieval, answer correctness, evidence support and response time.", "Explain the effect of one retrieval-setting change.", "Demonstrate a reproducible project and explain its limitations."],
    sessions: [
      {
        title: "Project Clinic and Evaluation", format: "Monday / In person",
        theory: "Retrieval hit rate, answer correctness, evidence support, citation quality, response time, document privacy and prompt-injection risks.",
        practical: "Run the fixed evaluation set, compare one chunk-size or top-k change, inspect failures and verify citations and missing-answer handling.",
        output: "Before/after evaluation table, corrected issues and a rehearsed demonstration. Keep a small question subset unseen until final assessment.",
        timing: "15 min review + 20 min evaluation briefing + 70 min clinic + 15 min rehearsal",
      },
      {
        title: "Final Project Showcase", format: "Friday/Saturday / Google Meet",
        theory: "Explain the problem, data checks, RAG workflow, evaluation evidence and limitations.",
        practical: "Demonstrate an answer with supporting evidence, an unsupported question and a failure case. Complete your individual viva and discuss feedback.",
        output: "Final notebook, report, slides and assessment feedback. Individual demonstration slots are allocated by the trainer.",
        timing: "10 min setup + 80 min demonstrations/viva + 20 min feedback + 10 min next steps",
      },
    ],
    tasks: ["Measure retrieval hit rate over the eight answerable questions and abstentions over the two unanswerable questions.", "Document one setting change and its before/after results.", "Record model IDs, package versions and execution steps; rehearse the individual demonstration."],
    deliverables: ["Final notebook and source manifest", "Evaluation table and 2-3 page report", "Five-slide individual demonstration"],
    materials: ["Week 3 RAG notebook and failure log", "Fixed evaluation questions", "Assessment rubric and presentation outline"],
  },
];