import "server-only";

import { ArrowDown, ArrowRight, BookOpen, Boxes, ChevronDown, Code2, ExternalLink, Lightbulb, LockKeyhole, NotebookPen, RotateCcw, Terminal, Workflow, Wrench } from "lucide-react";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import { weekOnePracticeOpen } from "@/lib/week-one";

hljs.registerLanguage("python", python);

type Example = { title: string; code: string; output: string; explanation: string[] };
type Lesson = { id: string; title: string; paragraphs: string[]; examples: Example[]; remember: string };

function CodeCell({ title, code, output }: { title: string; code: string; output?: string }) {
  const highlighted = hljs.highlight(code, { language: "python" }).value;
  return <figure className="min-w-0 overflow-hidden rounded-lg border border-white/25 bg-[#111416]">
    <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-white/20 bg-white/5 px-4 py-4">
      <span className="flex min-w-0 items-start gap-3 text-sm font-semibold text-white"><Code2 aria-hidden="true" className="size-5 shrink-0 text-[#82dfff]" />{title}</span>
      <span className="font-mono text-xs font-medium text-[#82dfff]">Python</span>
    </figcaption>
    <pre tabIndex={0} aria-label={`${title}: Python code`} className="max-w-full overflow-x-auto p-4 font-mono text-[13px] leading-7 text-white sm:p-5"><code className="[&_.hljs-keyword]:text-[#ff9dba] [&_.hljs-built_in]:text-[#82dfff] [&_.hljs-title]:text-[#82dfff] [&_.hljs-string]:text-[#c5ef95] [&_.hljs-number]:text-[#ffc78a] [&_.hljs-literal]:text-[#ffc78a] [&_.hljs-comment]:italic [&_.hljs-comment]:text-white" dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
    {output !== undefined && <div className="border-t border-white/20 bg-[#101b16]">
      <p className="flex items-center gap-2 px-4 pt-4 text-xs font-semibold text-[#b8efcd] sm:px-5"><Terminal aria-hidden="true" className="size-4" />Expected output</p>
      <pre tabIndex={0} aria-label={`${title}: expected output`} className="max-w-full overflow-x-auto p-4 font-mono text-[13px] leading-7 text-white sm:p-5">{output}</pre>
    </div>}
  </figure>;
}

export const handbookLessons: Lesson[] = [
  {
    id: "python", title: "Essential Python before PyTorch",
    paragraphs: [
      "Python is the language in which we write instructions. A variable gives a value a name; a list groups values in order. Python starts counting positions at zero, so readings[0] means the first reading. Decimal numbers are floating-point values; whole numbers are integers.",
      "A function is a named, reusable calculation. def starts its definition, the indented lines belong to it, and return sends a result back to the caller. print displays a value. An import makes another package's functions available. You do not need to know every part of Python before starting this handbook.",
    ],
    examples: [{ title: "Convert a temperature reading", code: `readings = [20.0, 25.0, 30.0]

def celsius_to_fahrenheit(celsius):
    return celsius * 9 / 5 + 32

first_reading = readings[0]
print(first_reading)
print(len(readings))
print(celsius_to_fahrenheit(first_reading))
for reading in readings:
    print(celsius_to_fahrenheit(reading))`, output: "20.0\n3\n68.0\n68.0\n77.0\n86.0", explanation: [
      "readings holds three temperatures. len(readings) counts them. The function transforms one Celsius value into Fahrenheit using a known formula.",
      "The for loop repeats the indented print for each value. The first 68.0 comes from the separate function call; the next three lines come from the loop. Indentation is part of Python syntax, not decoration.",
    ] }], remember: "Use meaningful names, keep indentation consistent, and use print to inspect intermediate results.",
  },
  {
    id: "first-tensor", title: "What PyTorch and tensors do",
    paragraphs: [
      "PyTorch is a Python library for numerical calculations and machine learning. In ordinary programming, we supply a rule, such as the Celsius conversion above. In machine learning, we choose a model with adjustable numbers and use examples to improve those numbers. PyTorch helps calculate predictions, measure errors and compute how the adjustable numbers should change.",
      "A tensor is an organized collection of numbers. One number is a scalar (zero dimensions), one list is a vector (one dimension), and rows with columns form a matrix (two dimensions). More dimensions can represent batches of images or measurements over time. A tensor is not a model by itself.",
      "Think of three marks for one student as a vector. Marks for two students across three subjects form a 2-by-3 matrix. The shape describes the arrangement; it is not the same as the total number of values.",
    ],
    examples: [{ title: "Scalar, vector and matrix", code: `import torch

temperature = torch.tensor(25.0)
student_marks = torch.tensor([70.0, 80.0, 90.0])
class_marks = torch.tensor([[70.0, 80.0, 90.0],
                            [60.0, 75.0, 85.0]])
print(temperature.item(), tuple(temperature.shape))
print(student_marks.tolist(), tuple(student_marks.shape))
print(class_marks.tolist())
print(tuple(class_marks.shape), class_marks.ndim, class_marks.numel())`, output: "25.0 ()\n[70.0, 80.0, 90.0] (3,)\n[[70.0, 80.0, 90.0], [60.0, 75.0, 85.0]]\n(2, 3) 2 6", explanation: [
      "torch.tensor creates a tensor from supplied data. A scalar has shape (), a vector with three entries has shape (3,), and the matrix has shape (2, 3). The comma in (3,) is Python's notation for a one-element tuple.",
      "ndim counts dimensions and numel() counts values. item() converts a one-value tensor to a Python number; tolist() converts tensor values to ordinary lists for readable output. item() cannot extract an entire multi-value tensor.",
    ] }], remember: "Always ask what each row and column represents before choosing a tensor shape.",
  },
  {
    id: "dtype-device", title: "Shape, data type and device",
    paragraphs: [
      "Three properties help explain most beginner errors: shape is the arrangement, dtype is the kind of number, and device is where the tensor is stored. Measurements and trainable parameters generally use floating-point values. Integer tensors are useful for counts and indices, but cannot track gradients.",
      "These small lessons work in Colab's standard runtime; a GPU is not required. Selecting a GPU runtime does not automatically move existing tensors to it. Tensors participating in an operation must be on compatible devices. The optional device example chooses CUDA only when it is available and moves the entire tensor with .to(device).",
    ],
    examples: [
      { title: "Convert integer readings for a mean", code: `import torch

readings = torch.tensor([20, 25, 30])
decimal_readings = readings.to(dtype=torch.float32)
print(readings.dtype)
print(decimal_readings.dtype)
print(decimal_readings.mean().item())`, output: "torch.int64\ntorch.float32\n25.0", explanation: [
        "PyTorch infers an integer type from whole numbers. mean() needs a floating-point or complex tensor; conversion to float32 allows a fractional average. The conversion returns a tensor, so keep its result.",
      ] },
      { title: "Move data to an available device", code: `import torch

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
readings = torch.tensor([20.0, 25.0, 30.0]).to(device)
print(readings.device.type == device.type)
print(readings.mean().item())`, output: "True\n25.0", explanation: [
        "The first output confirms the data is on the selected device. The answer stays 25.0 on either device. In later training, both model parameters and input tensors must be moved together.",
      ] },
    ], remember: "Inspect tensor.shape, tensor.dtype and tensor.device when an operation fails.",
  },
  {
    id: "creation", title: "Creating tensors and repeatable random data",
    paragraphs: [
      "Use tensor when you already know the values, zeros for an empty numerical starting point, ones for repeated ones and arange for a sequence. arange includes its start and excludes its end. A tuple such as (2, 3) requests two rows and three columns.",
      "Random numbers are useful for simulations and model initialization. A seed resets the random-number sequence for repeatable experiments in the same environment. It does not guarantee identical results across every device, version or training algorithm.",
    ],
    examples: [{ title: "Zeros, ones, a range and a seeded sample", code: `import torch

print(torch.zeros((2, 3)).tolist())
print(torch.ones((2, 2)).tolist())
print(torch.arange(0, 6).tolist())
torch.manual_seed(7)
first_sample = torch.rand(3)
torch.manual_seed(7)
second_sample = torch.rand(3)
print(tuple(first_sample.shape))
print(bool(((first_sample >= 0) & (first_sample < 1)).all()))
print(torch.equal(first_sample, second_sample))`, output: "[[0.0, 0.0, 0.0], [0.0, 0.0, 0.0]]\n[[1.0, 1.0], [1.0, 1.0]]\n[0, 1, 2, 3, 4, 5]\n(3,)\nTrue\nTrue", explanation: [
      "rand produces values from zero inclusive to one exclusive. The comparisons test each value, & combines the conditions and all() checks that every value satisfies them.",
      "Resetting the seed before the second sample produces the same three values. We test equality rather than relying on a particular set of printed random decimals.",
    ] }], remember: "Set a seed when comparing experiments; do not reset it inside every training step.",
  },
  {
    id: "indexing", title: "Selecting rows, columns and ranges",
    paragraphs: [
      "Indexing selects a position; slicing selects a range. In a matrix, the first index chooses a row and the second chooses a column. A colon means all values on that axis. Negative indices count backward, so -1 selects the last position.",
      "A slice start:end includes start but excludes end. For three subjects, 0:2 selects the first two. Selecting one row with marks[0] removes that row dimension; marks[0:1] retains a one-row matrix. That difference matters when matching shapes.",
    ],
    examples: [{ title: "Read a small marks table", code: `import torch

marks = torch.tensor([[70.0, 80.0, 90.0],
                      [60.0, 75.0, 85.0]])
print(marks[0].tolist())
print(marks[:, 1].tolist())
print(marks[1, 2].item())
print(marks[:, 0:2].tolist())
print(marks[-1].tolist())
print(tuple(marks[0].shape), tuple(marks[0:1].shape))`, output: "[70.0, 80.0, 90.0]\n[80.0, 75.0]\n85.0\n[[70.0, 80.0], [60.0, 75.0]]\n[60.0, 75.0, 85.0]\n(3,) (1, 3)", explanation: [
      "marks[:, 1] selects the second subject for both students. marks[1, 2] selects the second student's third subject. Both follow zero-based indexing.",
      "The two final shapes contain the same three values but have different dimensions. A single index selects an item; a slice preserves a range.",
    ] }], remember: "Write the row and column meaning beside your data before indexing it.",
  },
  {
    id: "reshaping", title: "Reshaping is not transposing",
    paragraphs: [
      "reshape rearranges the shape while preserving the number of values and their reading order. Six values can become 2-by-3 or 3-by-2, but not 4-by-2. One dimension can be -1, asking PyTorch to infer it from the other dimensions.",
      "A transpose exchanges axes. For a two-dimensional matrix, .T exchanges rows and columns. Reshaping a 2-by-3 matrix to 3-by-2 is not the same operation as transposing it. Use clone() when you need an independent copy; reshapes and slices can share underlying storage.",
    ],
    examples: [{ title: "Compare two arrangements", code: `import torch

sequence = torch.arange(1, 7)
matrix = sequence.reshape(2, 3)
print(matrix.tolist())
print(matrix.reshape(3, 2).tolist())
print(matrix.T.tolist())
print(tuple(matrix.reshape(1, -1).shape))
independent = matrix.clone()
independent[0, 0] = 99
print(matrix[0, 0].item())`, output: "[[1, 2, 3], [4, 5, 6]]\n[[1, 2], [3, 4], [5, 6]]\n[[1, 4], [2, 5], [3, 6]]\n(1, 6)\n1", explanation: [
      "The reshape reads 1 through 6 in the original order into new rows. The transpose turns the original columns into rows, producing a different result.",
      "The inferred dimension is six because the other dimension is one. Changing the clone leaves the original value at 1.",
    ] }], remember: "Check the element count before reshaping, and check the data's meaning afterward.",
  },
  {
    id: "arithmetic", title: "Arithmetic, totals and averages",
    paragraphs: [
      "Tensor arithmetic acts on values, not on Python list structure. Adding two Python lists joins them; adding equal-shaped tensors adds matching entries. The operators +, -, *, / and ** mean addition, subtraction, element-wise multiplication, division and powers.",
      "A reduction combines many values into fewer values. sum() totals entries and mean() averages them. Without dim, the reduction uses every value. With dim=0 it combines rows, leaving one result per column. With dim=1 it combines columns, leaving one result per row.",
    ],
    examples: [{ title: "Class averages and corrected readings", code: `import torch

marks = torch.tensor([[60.0, 80.0, 100.0],
                      [40.0, 60.0, 80.0]])
print((marks + 5).tolist())
print((marks / 100).tolist())
print(marks.sum().item())
print(marks.mean().item())
print(marks.mean(dim=0).tolist())
print(marks.mean(dim=1).tolist())`, output: "[[65.0, 85.0, 105.0], [45.0, 65.0, 85.0]]\nApproximately [[0.6, 0.8, 1.0], [0.4, 0.6, 0.8]]\n420.0\n70.0\n[50.0, 70.0, 90.0]\n[80.0, 60.0]", explanation: [
      "Adding five applies to every mark. It does not enforce a maximum of 100; domain rules are our responsibility. Dividing by 100 changes the scale, not the relative ordering.",
      "The two students average 80 and 60 respectively. The three subjects average 50, 70 and 90. float32 may display 0.6000000238 instead of exactly 0.6 because binary floating-point approximates many decimal fractions.",
    ] }], remember: "Name the axis you want to combine: across students is dim=0; across subjects is dim=1 in this table.",
  },
  {
    id: "broadcasting", title: "Broadcasting: using smaller tensors safely",
    paragraphs: [
      "Broadcasting lets PyTorch combine compatible shapes without manually copying values. Compare dimensions from the right: they must be equal or one must be 1; a missing leading dimension acts like 1. A shape (2, 3) can combine with (3,) because the three values line up with its columns.",
      "For two row-specific adjustments, use shape (2, 1). A plain shape (2,) does not match the last dimension of a (2, 3) table. Broadcasting can also produce a valid but unintended result: subtracting shape (3, 1) from (3,) creates shape (3, 3), not three paired errors.",
    ],
    examples: [{ title: "Column corrections versus row corrections", code: `import torch

readings = torch.tensor([[10.0, 20.0, 30.0],
                         [40.0, 50.0, 60.0]])
column_offsets = torch.tensor([1.0, 2.0, 3.0])
row_offsets = torch.tensor([[1.0], [2.0]])
print((readings + column_offsets).tolist())
print((readings + row_offsets).tolist())
targets = torch.tensor([1.0, 2.0, 3.0])
print(tuple((targets.reshape(3, 1) - targets).shape))`, output: "[[11.0, 22.0, 33.0], [41.0, 52.0, 63.0]]\n[[11.0, 21.0, 31.0], [42.0, 52.0, 62.0]]\n(3, 3)", explanation: [
      "The vector adds 1, 2 and 3 to the corresponding columns in both rows. The column-shaped tensor adds 1 to every value in row one and 2 to every value in row two.",
      "The last line demonstrates an unintended pairwise grid. Check prediction.shape == target.shape before a simple element-wise loss calculation.",
    ] }], remember: "A calculation running without an error does not prove that its shapes express your intended calculation.",
  },
  {
    id: "matrix-product", title: "Element-wise versus matrix multiplication",
    paragraphs: [
      "The * operator multiplies matching entries. The @ operator performs matrix multiplication: each output is a row-column sum of products. For two matrices, (rows, inner) @ (inner, columns) produces (rows, columns). The inner dimensions must agree.",
      "Imagine two devices with two input measurements each. A vector of weights says how much each measurement contributes to a score. Matrix multiplication computes one weighted total for each device. This same pattern appears in many machine-learning layers.",
    ],
    examples: [{ title: "Two measurements become one score", code: `import torch

measurements = torch.tensor([[1.0, 2.0],
                             [3.0, 4.0]])
weights = torch.tensor([[2.0], [3.0]])
print((measurements * measurements).tolist())
scores = measurements @ weights
print(scores.tolist())
print(tuple(scores.shape))`, output: "[[1.0, 4.0], [9.0, 16.0]]\n[[8.0], [18.0]]\n(2, 1)", explanation: [
      "Element-wise multiplication squares each measurement. For matrix multiplication, the first score is 1*2 + 2*3 = 8; the second is 3*2 + 4*3 = 18.",
      "The shapes (2, 2) and (2, 1) share the inner dimension 2. The result keeps two rows and one output column.",
    ] }], remember: "Use * for paired products and @ when each output needs a weighted sum.",
  },
  {
    id: "prediction-loss", title: "From a prediction to a loss",
    paragraphs: [
      "A model is a rule with adjustable parameters. For a simple calibration, prediction = weight * input. The input is a measurement, the target is a known reference value and the weight is the adjustable scale. A more general straight line also has a bias: prediction = weight * input + bias.",
      "An error is prediction minus target. Positive and negative errors can cancel if averaged directly. Mean squared error (MSE) squares each error, then averages the squares: loss = mean((prediction - target)**2). Lower MSE means closer predictions on those examples; it is not an accuracy percentage.",
    ],
    examples: [{ title: "Measure a calibration error", code: `import torch

inputs = torch.tensor([1.0, 2.0, 3.0])
targets = torch.tensor([2.0, 4.0, 6.0])
weight = torch.tensor(1.0)
predictions = weight * inputs
errors = predictions - targets
loss = (errors ** 2).mean()
print(predictions.tolist())
print(errors.tolist())
print((errors ** 2).tolist())
print(round(loss.item(), 4))`, output: "[1.0, 2.0, 3.0]\n[-1.0, -2.0, -3.0]\n[1.0, 4.0, 9.0]\n4.6667", explanation: [
      "With weight 1, the model underestimates every target. The squares sum to 14; dividing by the three examples gives 4.6667 after rounding.",
      "Weight 2 would reproduce this deliberately simple data exactly. Real measurements contain noise, and a model that fits its training examples may still predict poorly on new measurements.",
    ] }], remember: "Inputs are observed data, targets are reference answers, parameters are adjusted, and loss measures disagreement.",
  },
  {
    id: "autograd", title: "Gradients without hand-coding derivatives",
    paragraphs: [
      "A gradient tells us how a small change in a parameter changes the loss near its current value. A positive gradient means increasing that parameter locally increases loss; a negative gradient means increasing it locally decreases loss. Its magnitude tells us the local sensitivity, not the final answer.",
      "Set requires_grad=True on the floating-point parameters whose gradients you need. PyTorch records their calculations in a computational graph. Calling backward() on a scalar loss applies the chain rule and accumulates gradients into the parameters' .grad attributes. backward() calculates gradients; it does not update the parameters.",
      "For a single input of 2 and target of 6, prediction = 2*weight and loss = (2*weight - 6)**2. The derivative is 2*(2*weight - 6)*2. At weight 1, it equals -16. We can inspect the same result with autograd.",
    ],
    examples: [{ title: "Read a gradient and make one update", code: `import torch

weight = torch.tensor(1.0, requires_grad=True)
prediction = weight * 2.0
loss = (prediction - 6.0) ** 2
loss.backward()
print(loss.item())
print(weight.grad.item())
learning_rate = 0.1
with torch.no_grad():
    weight -= learning_rate * weight.grad
    new_loss = (weight * 2.0 - 6.0) ** 2
print(round(weight.item(), 4))
print(round(new_loss.item(), 4))`, output: "16.0\n-16.0\n2.6\n0.64", explanation: [
      "Gradient descent subtracts learning_rate * gradient. Here 1 - 0.1*(-16) becomes 2.6, moving toward the ideal weight 3. The loss falls from 16 to 0.64.",
      "no_grad prevents the manual update from becoming part of the graph. The learning rate sets the step size. A step that is too large can overshoot and increase loss; a small step may learn slowly.",
      "Each new training step should build a fresh prediction and loss, then clear old gradients before backward(). Do not repeatedly call backward() on the same old loss or detach the prediction before computing a loss that needs gradients.",
    ] }], remember: "The sequence is predict, measure loss, clear old gradients, backward, then update.",
  },
  {
    id: "training", title: "A complete guided calibration example",
    paragraphs: [
      "This is a fully worked demonstration, not today's homework. We use synthetic readings [1, 2, 3] and reference values [2, 4, 6]. The relationship is deliberately simple: target = 2 * input. Our model has one parameter and no bias. It starts with weight 0 and learns from all three examples together.",
      "An epoch is one pass through the training data. Here each epoch uses the entire three-value batch. SGD is an optimizer that applies the gradient-descent update for us. zero_grad() clears old gradients, backward() computes current gradients, and step() changes the parameter using the selected learning rate.",
      "In this case MSE = (14/3)*(weight - 2)**2, so its derivative is (28/3)*(weight - 2). With learning rate 0.1, the first step moves weight from 0 to about 1.8667. Further small corrections approach 2. This explains the decreasing loss rather than treating training as a mysterious operation.",
    ],
    examples: [{ title: "Train, inspect and predict a new reading", code: `import torch

inputs = torch.tensor([1.0, 2.0, 3.0])
targets = torch.tensor([2.0, 4.0, 6.0])
weight = torch.tensor(0.0, requires_grad=True)
optimizer = torch.optim.SGD([weight], lr=0.1)

for epoch in range(5):
    predictions = weight * inputs
    loss = ((predictions - targets) ** 2).mean()
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    print(f"Epoch {epoch + 1}: loss before update = {loss.item():.4f}")

with torch.no_grad():
    new_input = torch.tensor(4.0)
    prediction = weight * new_input
    final_loss = ((weight * inputs - targets) ** 2).mean()
print(f"Learned weight: {weight.item():.4f}")
print(f"Prediction for 4: {prediction.item():.4f}")
print(f"Final training loss: {final_loss.item():.4f}")`, output: "Epoch 1: loss before update = 18.6667\nEpoch 2: loss before update = 0.0830\nEpoch 3: loss before update = 0.0004\nEpoch 4: loss before update = 0.0000\nEpoch 5: loss before update = 0.0000\nLearned weight: 2.0000\nPrediction for 4: 8.0000\nFinal training loss: 0.0000", explanation: [
      "The printed loss belongs to the prediction made before that epoch's update. We recompute final_loss after the loop to measure the final parameter. Four decimal places can display 0.0000 even when the underlying loss is tiny rather than exactly zero.",
      "The new input 4 was not in the training inputs. The prediction is close to 8 because the synthetic relationship was linear with scale 2. This one check illustrates inference, not a reliable real-world evaluation.",
      "For a real project, reserve separate validation/test data, avoid leaking their answers into training and compare with a simple baseline. A low training loss alone is not evidence of generalization. More layers are not automatically better.",
      "Running the whole cell again recreates weight and the optimizer, so the demonstration starts afresh. Changing the inputs' scale or learning rate can alter convergence. Keep this baseline unchanged until you understand each step.",
    ] }], remember: "You have now followed data to prediction, loss, gradient, update and inference. Continue with today's classroom exercises, then complete the independent homework.",
  },
];

const contents = [
  { title: "Start here", items: [
    { id: "onboarding", title: "Portal & Colab" },
    { id: "python", title: "Python recap" },
    { id: "first-tensor", title: "Meet PyTorch" },
  ] },
  { title: "Tensor essentials", items: [
    { id: "dtype-device", title: "Shape, type & device" },
    { id: "creation", title: "Creating tensors" },
    { id: "indexing", title: "Indexing & slicing" },
    { id: "reshaping", title: "Reshape & transpose" },
    { id: "arithmetic", title: "Arithmetic & reductions" },
    { id: "broadcasting", title: "Broadcasting" },
    { id: "matrix-product", title: "Matrix multiplication" },
  ] },
  { title: "Learning with PyTorch", items: [
    { id: "prediction-loss", title: "Predictions & loss" },
    { id: "autograd", title: "Gradients & autograd" },
    { id: "training", title: "Guided training example" },
  ] },
  { title: "Reference", items: [
    { id: "troubleshooting", title: "Troubleshooting" },
    { id: "reference", title: "Glossary & quick reference" },
  ] },
];

function TensorDiagramGrid({ label, values, trackValues = false, broadcast = false }: { label: string; values: number[][]; trackValues?: boolean; broadcast?: boolean }) {
  return <table aria-label={label} className="mx-auto border-separate border-spacing-1.5 font-mono text-sm">
    <tbody>{values.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, columnIndex) => <td key={columnIndex} className={`h-11 min-w-11 rounded border text-center font-semibold ${broadcast ? "border-[#ffc78a]/60 bg-[#ffc78a]/10 text-[#ffc78a]" : trackValues && value > 3 ? "border-primary/50 bg-primary/10 text-primary" : "border-[#82dfff]/50 bg-[#82dfff]/10 text-[#82dfff]"} ${broadcast && rowIndex > 0 ? "border-dashed" : ""}`}>{value}</td>)}</tr>)}</tbody>
  </table>;
}

function LessonDiagram({ lessonId }: { lessonId: string }) {
  if (lessonId === "reshaping") return <figure aria-labelledby="reshape-diagram-title" className="space-y-6 border-y border-white/20 bg-white/[0.025] px-4 py-6 sm:px-6">
    <figcaption id="reshape-diagram-title" className="flex items-center gap-3 text-base font-bold text-white"><Boxes aria-hidden="true" className="size-5 shrink-0 text-[#82dfff]" />Same values, different arrangements</figcaption>
    <div className="grid gap-6 sm:grid-cols-3">
      {[
        { label: "Original matrix", shape: "(2, 3)", values: [[1, 2, 3], [4, 5, 6]], detail: "Two rows, three columns." },
        { label: "reshape(3, 2)", shape: "(3, 2)", values: [[1, 2], [3, 4], [5, 6]], detail: "Read the original values in order into new rows." },
        { label: "matrix.T", shape: "(3, 2)", values: [[1, 4], [2, 5], [3, 6]], detail: "Turn each original column into a row." },
      ].map(({ label, shape, values, detail }) => <div key={label} className="min-w-0 space-y-3 text-center">
        <p className="font-mono text-sm font-semibold text-white">{label}</p>
        <p className="font-mono text-xs text-[#82dfff]">shape {shape}</p>
        <div className="flex min-h-40 items-center justify-center"><TensorDiagramGrid label={`${label}: shape ${shape}`} values={values} trackValues /></div>
        <p className="text-sm leading-6 text-white">{detail}</p>
      </div>)}
    </div>
    <p className="border-t border-white/20 pt-4 text-sm leading-7 text-white">Both results come from the original matrix. Follow values 1, 2 and 3 in blue: reshape keeps the reading order; transpose changes the axes. The two results have the same shape, but different arrangements.</p>
  </figure>;

  if (lessonId === "broadcasting") return <figure aria-labelledby="broadcast-diagram-title" className="space-y-6 border-y border-white/20 bg-white/[0.025] px-4 py-6 sm:px-6">
    <figcaption id="broadcast-diagram-title" className="flex items-center gap-3 text-base font-bold text-white"><Boxes aria-hidden="true" className="size-5 shrink-0 text-[#ffc78a]" />One correction per column</figcaption>
    <div className="grid gap-6 sm:grid-cols-3">
      <div className="min-w-0 space-y-3 text-center"><p className="text-sm font-semibold text-white">Readings</p><p className="font-mono text-xs text-[#82dfff]">shape (2, 3)</p><TensorDiagramGrid label="Original readings" values={[[10, 20, 30], [40, 50, 60]]} /></div>
      <div className="min-w-0 space-y-3 text-center"><p className="text-sm font-semibold text-[#ffc78a]">+ Column offsets</p><p className="font-mono text-xs text-white">(3,) aligns with (1, 3)</p><TensorDiagramGrid label="Offsets reused across both rows" values={[[1, 2, 3], [1, 2, 3]]} broadcast /></div>
      <div className="min-w-0 space-y-3 text-center"><p className="text-sm font-semibold text-primary">= Corrected readings</p><p className="font-mono text-xs text-white">shape (2, 3)</p><TensorDiagramGrid label="Column-corrected readings" values={[[11, 22, 33], [41, 52, 63]]} /></div>
    </div>
    <p className="border-t border-white/20 pt-4 text-sm leading-7 text-white">The dashed row shows reuse, not a stored copy: +1 applies to column one, +2 to column two and +3 to column three. Broadcasting does not require manually duplicating the offsets.</p>
  </figure>;

  if (lessonId === "training") return <figure aria-labelledby="training-diagram-title" className="space-y-6 border-y border-white/20 bg-white/[0.025] px-4 py-6 sm:px-6">
    <figcaption id="training-diagram-title" className="flex items-center gap-3 text-base font-bold text-white"><Workflow aria-hidden="true" className="size-5 shrink-0 text-primary" />One epoch through the learning loop</figcaption>
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-white/20 pb-4 font-mono text-[13px] leading-6"><p className="text-[#82dfff]">inputs: [1, 2, 3]</p><p className="text-[#ffc78a]">targets: [2, 4, 6]</p></div>
    <ol aria-label="Training loop steps" className="space-y-0">
      {[
        ["Predict", "predictions = weight * inputs", "Use the current weight to scale each input."],
        ["Measure loss", "((predictions - targets) ** 2).mean()", "Compare predictions with the reference targets."],
        ["Clear old gradients", "optimizer.zero_grad()", "Remove accumulated gradients from the previous step."],
        ["Compute gradients", "loss.backward()", "Calculate how the loss changes with the weight."],
        ["Update the weight", "optimizer.step()", "Apply the gradient-descent update using the learning rate."],
      ].map(([title, operation, detail], index) => <li key={title} className="relative grid grid-cols-[36px_minmax(0,1fr)] gap-4 pb-6 last:pb-0">
        {index < 4 && <span aria-hidden="true" className="absolute bottom-0 left-[17px] top-9 flex w-px items-center justify-center bg-white/25"><ArrowDown className="size-3 shrink-0 bg-[#101010] text-primary" /></span>}
        <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full border border-primary/50 bg-primary/10 font-mono text-sm font-semibold text-primary">{index + 1}</span>
        <div className="min-w-0 space-y-2 pt-1"><p className="text-sm font-bold text-white">{title}</p><code className="block font-mono text-[13px] leading-6 text-[#82dfff] [overflow-wrap:anywhere]">{operation}</code><p className="text-sm leading-6 text-white">{detail}</p></div>
      </li>)}
    </ol>
    <div className="flex items-start gap-3 border-t border-primary/40 pt-4"><RotateCcw aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" /><p className="text-sm leading-7 text-white"><strong className="font-semibold text-primary">Return to Predict.</strong> Use the updated weight and build a fresh prediction and loss for the next epoch. Repeat five times in this example.</p></div>
    <p className="flex items-start gap-3 text-sm leading-7 text-white"><ArrowRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-[#82dfff]" /><span>After training: input 4 with learned weight approximately 2 gives prediction approximately 8, inside <code className="font-mono">torch.no_grad()</code>. Inference does not update the weight.</span></p>
  </figure>;

  return null;
}

const wednesdayLessonIds = new Set(["python", "first-tensor", "dtype-device", "creation", "indexing", "arithmetic"]);

const introductionLessons: Lesson[] = [
  {
    id: "meet-pytorch", title: "What is PyTorch?",
    paragraphs: [
      "PyTorch is an open-source framework for numerical computing and machine learning. A framework is a collection of reusable tools: it helps us store numbers, calculate with them and build models without writing every component ourselves.",
      "Python is the programming language. PyTorch is a tool we use through Python. Open source means its code is available to inspect, use and contribute to under its licence. PyTorch itself is software, not a trained AI model.",
    ], examples: [], remember: "Python is the language; PyTorch supplies tools for calculations and learning.",
  },
  {
    id: "why-learning", title: "Why is PyTorch useful for AI and ML?",
    paragraphs: [
      "Artificial intelligence (AI) is the broad field of systems that perform tasks such as perception and decision-making. Machine learning (ML) is part of AI: models learn patterns from data. Deep learning is part of ML that uses neural networks with multiple processing layers. PyTorch is especially useful for deep learning.",
      "A temperature conversion uses a formula we already know; it does not need training. Predicting a building's electricity use from weather and occupancy may require learning a relationship from past records. Other applications include recognizing defects in images and estimating equipment condition from vibration readings.",
      "A model turns inputs into a prediction. In training, a target is the known answer and loss measures the mismatch. Training adjusts the model's parameters (its internal numbers). PyTorch supplies fast calculations, gradients that describe how loss changes, and optimizers that use those gradients to adjust parameters.",
    ], examples: [], remember: "Training adjusts a model. Inference uses a trained model without updating it. Predictions still need checking on new data.",
  },
  {
    id: "inside-pytorch", title: "How is PyTorch built?",
    paragraphs: [
      "PyTorch grew from the Torch ecosystem and was publicly released in 2017, originally developed at Facebook AI Research with contributors. Today it is developed by an open community, with the PyTorch Foundation under the Linux Foundation.",
      "We write Python instructions, but much of PyTorch's numerical core is written in C++. It selects optimized calculation routines, called kernels, for the hardware being used. A short Python instruction can therefore perform a large calculation efficiently.",
      "Tensors hold the numbers. Autograd calculates gradients when tracking is enabled. torch.nn provides model building blocks; torch.optim provides parameter-update algorithms. These are names to recognize today, not APIs to memorize.",
    ], examples: [], remember: "We use the Python interface. We do not need to write C++ or GPU kernels to begin.",
  },
  {
    id: "tensor-picture", title: "What is a tensor?",
    paragraphs: [
      "A tensor is a numerical array arranged along zero or more axes. It can hold one temperature, a list of readings or a table of measurements. Images also become arrays of pixel values; text needs a numerical representation before a model processes it.",
      "A scalar holds one value with no axes. A vector has one axis. A matrix has two: rows and columns. Shape gives the size of each axis. Two sensors measured three times form shape (2, 3): two dimensions, but six values.",
      "A tensor also has a data type (how numbers are represented) and a device (where they are stored and processed). Today's decimal readings normally use float32 on the CPU. We will inspect these properties in code on Friday.",
    ], examples: [], remember: "A tensor stores numbers, not their physical meaning. We must say that our readings are temperatures in degrees Celsius.",
  },
  {
    id: "onboarding", title: "Set up a notebook in Colab",
    paragraphs: [
      "Google Colab is a browser-based notebook workspace. Python is the language it runs; PyTorch is the framework our code uses. A standard runtime is enough for today's examples; no GPU setup is needed.",
      "Open Google Colab, sign in with your Google account and choose File > New notebook. Name it Week1_Wednesday_YourName.ipynb. Add a text cell with your name and lesson title, then a code cell for the first example below.",
      "Connect the runtime and run a code cell with its play button. Code is the instruction; the output appears beneath it. Run the three examples in order because each uses the previous result. Type only the Python code, not the expected output.",
      "Use File > Save and check the saved status. If the runtime restarts, your saved code remains but variables are lost: run the cells again from the top. These are your learning notes; no submission or Drive connection to the portal is needed today.",
    ], examples: [], remember: "Read an example, predict the result, run it, then explain the output in your own words.",
  },
  {
    id: "temperature-examples", title: "Three small temperature examples",
    paragraphs: ["One sensor records 20, 25 and 30 degrees Celsius. We will store the readings, correct a known sensor error and calculate an average. These are ordinary calculations, not model training."],
    examples: [
      { title: "1. Store the readings", code: `import torch

readings = torch.tensor([20.0, 25.0, 30.0])
print(readings)`, output: "tensor([20., 25., 30.])", explanation: [
        "import torch makes PyTorch available under the name torch. torch.tensor(...) creates a tensor from the supplied numbers; the square brackets group them into a Python list. The decimal points indicate floating-point values.",
        "readings = gives that tensor a name. print(readings) displays it. The output 20. means 20.0; the values have not changed. We have represented three measurements, not trained a model.",
      ] },
      { title: "2. Correct a known sensor error", code: `corrected = readings + 2
print(corrected)`, output: "tensor([22., 27., 32.])", explanation: [
        "A calibration check tells us the sensor reads 2 degrees too low. readings + 2 adds two to each entry: 20 + 2 = 22, 25 + 2 = 27, and 30 + 2 = 32.",
        "corrected = names the new result; readings still contains the original values. print(corrected) displays the corrected temperatures. We supplied the rule ourselves, so this is not learning.",
      ] },
      { title: "3. Find the average", code: `average = corrected.mean()
print(average)
print(average.item())`, output: "tensor(27.)\n27.0", explanation: [
        "The mean adds the readings and divides by their count: (22 + 27 + 32) / 3 = 27. corrected.mean() performs that calculation and average stores its result.",
        "print(average) shows a scalar tensor: one result, tensor(27.). average.item() extracts that single value as an ordinary Python number, so the next line is 27.0. Both represent the same average temperature.",
      ] },
    ], remember: "A tensor represents data. An operation calculates with it. Neither automatically creates a trained AI model.",
  },
];

function IntroductionDiagram({ lessonId }: { lessonId: string }) {
  const steps = lessonId === "why-learning" ? [
    ["1. Predict", "Inputs such as weather and occupancy enter the model."],
    ["2. Compare", "Compare predicted energy use with the measured target to calculate loss."],
    ["3. Adjust and repeat", "Update the model's parameters, then calculate again."],
  ] : lessonId === "inside-pytorch" ? [
    ["Python interface", "Our instructions describe the calculation."],
    ["C++ numerical core", "PyTorch selects an implementation for the operation."],
    ["Optimized routines", "Compute kernels perform the arithmetic."],
    ["Hardware", "A CPU or supported accelerator executes it. CUDA supports NVIDIA GPUs."],
  ] : null;
  if (steps) return <figure aria-labelledby={`${lessonId}-diagram-title`} className="space-y-5 border-y border-white/20 bg-white/[0.025] px-4 py-6 sm:px-6">
    <figcaption id={`${lessonId}-diagram-title`} className="text-base font-bold text-[#82dfff]">{lessonId === "why-learning" ? "The idea of training" : "From our instructions to the hardware"}</figcaption>
    <ol className="space-y-4">{steps.map(([title, description], index) => <li key={title} className="space-y-4">
      {index > 0 && <ArrowDown aria-hidden="true" className="size-5 text-primary" />}
      <div className="border-l-2 border-primary pl-4"><p className="text-sm font-bold text-white">{title}</p><p className="text-sm leading-7 text-white">{description}</p></div>
    </li>)}</ol>
  </figure>;
  if (lessonId !== "tensor-picture") return null;
  return <figure aria-labelledby="tensor-picture-diagram-title" className="space-y-6 border-y border-white/20 bg-white/[0.025] px-4 py-6 sm:px-6">
    <figcaption id="tensor-picture-diagram-title" className="text-base font-bold text-[#82dfff]">The same kind of measurement, three arrangements</figcaption>
    <div className="grid gap-6 md:grid-cols-3">{[
      { title: "Scalar", values: [[25]], detail: "One temperature: 25. Zero axes. The box is just a drawing of one value." },
      { title: "Vector", values: [[20, 25, 30]], detail: "One sensor, three times. One axis with three positions: shape (3,)." },
      { title: "Matrix", values: [[20, 25, 30], [22, 27, 32]], detail: "Two sensors (rows), three times (columns). Two axes: shape (2, 3)." },
    ].map(({ title, values, detail }) => <div key={title} className="min-w-0 space-y-4"><h4 className="text-center text-sm font-bold text-white">{title}</h4><TensorDiagramGrid label={`${title} temperature illustration`} values={values} /><p className="text-sm leading-7 text-white">{detail}</p></div>)}</div>
    <p className="text-sm leading-7 text-white">Six values in the matrix do not mean six dimensions. Rows and columns are its two axes.</p>
  </figure>;
}

function WednesdayHandbook() {
  const groups = [{ title: "Today's introduction", items: introductionLessons.map(({ id, title }) => ({ id, title })) }, { title: "Finish here", items: [{ id: "wednesday-recap", title: "Recap and questions" }] }];
  const sectionIds = new Set(groups.flatMap(group => group.items.map(item => item.id)));
  return <section aria-labelledby="handbook-title" className="space-y-8">
    <header className="space-y-3 border-b border-white/20 pb-6"><p className="text-sm font-medium text-primary">Wednesday, September 30 / PyTorch handbook</p><h2 id="handbook-title" className="text-2xl font-semibold">Getting started with PyTorch</h2><p className="max-w-3xl text-sm leading-7 text-white">Revisit today&apos;s seminar: what PyTorch is, why it helps with learning, how it is built and what a tensor means. Then try the same three temperature examples. No previous PyTorch knowledge or Wednesday submission is required.</p></header>
    <div className="grid items-start gap-8 xl:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="hidden self-start xl:sticky xl:top-6 xl:block"><nav aria-label="Handbook contents" className="max-h-[calc(100vh-3rem)] space-y-5 overflow-y-auto rounded-lg border border-white/20 bg-[#101010] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.4)]"><p className="border-b border-white/20 pb-4 text-base font-semibold text-white">Contents</p><Contents sectionIds={sectionIds} groups={groups} /></nav></aside>
      <div className="min-w-0 space-y-10">
        <details className="group border-y border-white/20 py-4 xl:hidden"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">Handbook contents<ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" /></summary><nav aria-label="Handbook contents" className="pt-6"><Contents sectionIds={sectionIds} groups={groups} /></nav></details>
        {introductionLessons.map(lesson => <section key={lesson.id} id={lesson.id} aria-labelledby={`${lesson.id}-title`} className="scroll-mt-6 space-y-6 border-t border-white/20 pt-8">
          <h3 id={`${lesson.id}-title`} className="flex items-start gap-3 text-2xl font-bold leading-8 text-white"><BookOpen aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />{lesson.title}</h3>
          {lesson.paragraphs.map(paragraph => <p key={paragraph} className="text-sm leading-7 text-white">{paragraph}</p>)}
          <IntroductionDiagram lessonId={lesson.id} />
          {lesson.id === "onboarding" && <a href="https://colab.research.google.com/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/25 px-4 text-sm font-medium text-white hover:bg-white/10">Open Google Colab<ExternalLink aria-hidden="true" className="size-4" /></a>}
          {lesson.examples.map(example => <div key={example.title} className="min-w-0 space-y-4"><CodeCell title={example.title} code={example.code} output={example.output} /><h4 className="pt-2 text-sm font-bold text-[#82dfff]">What each line means</h4>{example.explanation.map(paragraph => <p key={paragraph} className="text-sm leading-7 text-white">{paragraph}</p>)}</div>)}
          <div className="flex items-start gap-3 border-l-2 border-primary bg-primary/5 px-4 py-5"><Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><p className="text-sm leading-7 text-white"><strong className="text-primary">Key takeaway: </strong>{lesson.remember}</p></div>
        </section>)}
        <section id="wednesday-recap" aria-labelledby="wednesday-recap-title" className="scroll-mt-6 space-y-5 border-t border-white/20 pt-8">
          <h3 id="wednesday-recap-title" className="text-2xl font-bold text-white">Wednesday recap: explain it in your own words</h3>
          <p className="text-sm leading-7 text-white">PyTorch supplies tools; people choose the problem, data and checks. Installing it does not create intelligence, and adding 2 to a tensor does not train a model.</p>
          <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-white"><li>How are Python, PyTorch and Colab different?</li><li>What does a tensor store? What does shape (2, 3) mean?</li><li>Why is correcting every reading by 2 a calculation rather than learning?</li></ul>
          <details className="border-y border-white/20 py-4"><summary className="cursor-pointer text-sm font-semibold text-primary">Compare your explanation</summary><p className="pt-4 text-sm leading-7 text-white">Python is the language, PyTorch the numerical and ML framework, and Colab the notebook workspace. A tensor stores numerical values; shape (2, 3) means two rows and three columns. Adding a known correction applies our rule, rather than adjusting model parameters from examples.</p></details>
          <p className="text-sm leading-7 text-white"><strong>Friday:</strong> continue tensor basics and operations with the instructor. You do not need to study indexing, device transfers or training code today. Keep your notebook as learning notes; there is no Wednesday submission.</p>
          <p className="text-sm leading-7 text-white"><strong>If a cell fails:</strong> check names, brackets and decimal points, then run all three cells from the top. Colab normally includes PyTorch; if import torch fails, ask the instructor for setup help.</p>
        </section>
      </div>
    </div>
  </section>;
}

function Contents({ sectionIds, groups = contents }: { sectionIds: Set<string>; groups?: typeof contents }) {
  const visibleGroups = groups.map(group => ({ ...group, items: group.items.filter(item => sectionIds.has(item.id)) })).filter(group => group.items.length);
  return <div className="space-y-6">{visibleGroups.map(({ title, items }) => <div key={title} className="space-y-2">
    <h3 className="text-xs font-semibold text-primary">{title}</h3>
    <ol aria-label={title} className="ml-0.5 border-l border-white/20">{items.map(({ id, title: label }) => <li key={id}>
      <a href={`#${id}`} className="-ml-px flex min-h-10 items-center border-l-2 border-transparent py-2 pl-3 pr-2 text-sm leading-5 text-white transition-colors hover:border-primary hover:bg-white/5 hover:text-primary focus-visible:border-primary focus-visible:bg-white/5 focus-visible:outline-2 focus-visible:outline-primary">{label}</a>
    </li>)}</ol>
  </div>)}</div>;
}

export function WeekOneOverview() {
  return <section aria-labelledby="week-overview" className="space-y-6">
    <div className="space-y-2"><h2 id="week-overview" className="text-xl font-semibold">Getting started with PyTorch</h2><p className="max-w-3xl text-sm leading-7 text-white">From programme orientation to your first tensor calculations and a guided learning example.</p></div>
    <ol className="divide-y divide-white/20 border-y border-white/20">
      {[
        ["Monday, September 28", "Programme overview", "Introduction to the programme, its learning journey and expectations."],
        ["Wednesday, September 30", "Getting started with PyTorch", "What PyTorch is, why AI/ML uses it, how it is built, tensors with diagrams, Colab setup and three explained temperature calculations."],
        ["Friday, October 2", "PyTorch continuation, exercises and homework", "Reshaping, broadcasting, matrix multiplication, predictions, loss, gradients and a guided training loop. Then complete classroom exercises and independent homework and submit your notebook. Friday's handbook and exercises open at 12:00 AM IST."],
      ].map(([date, title, description]) => <li key={date} className="grid gap-3 py-6 md:grid-cols-[220px_minmax(0,1fr)]"><p className="text-sm font-medium text-primary">{date}</p><div className="space-y-2"><h3 className="text-base font-semibold">{title}</h3><p className="max-w-2xl text-sm leading-7 text-white">{description}</p></div></li>)}
    </ol>
    <div className="space-y-3"><h3 className="text-base font-semibold">Wednesday learning outcomes</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-white"><li>Explain what PyTorch is and how it helps with machine learning.</li><li>Recognize its software layers and basic tensor arrangements.</li><li>Save a Colab notebook and explain the three temperature examples.</li><li>Distinguish a known calculation from model training. No Wednesday submission.</li></ul></div>
    <div className="space-y-3"><h3 className="text-base font-semibold">Friday learning outcomes</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-white"><li>Reshape tensors, apply broadcasting and calculate matrix products.</li><li>Trace predictions through loss, gradients and parameter updates.</li><li>Complete the exercises, then save and submit your independent homework notebook.</li></ul></div>
  </section>;
}

export function WeekOneHandbook({ day = "wednesday" }: { day?: "wednesday" | "friday" } = {}) {
  if (day === "wednesday") return <WednesdayHandbook />;
  const friday = day === "friday";
  if (friday && !weekOnePracticeOpen()) return <FridayLocked />;
  const lessons = handbookLessons.filter(lesson => friday !== wednesdayLessonIds.has(lesson.id));
  const sectionIds = new Set([...lessons.map(lesson => lesson.id), "troubleshooting", "reference", ...(!friday ? ["onboarding"] : [])]);
  return <section aria-labelledby="handbook-title" className="space-y-8">
    <header className="space-y-3 border-b border-white/20 pb-6"><p className="text-sm font-medium text-primary">{friday ? "Friday, October 2" : "Wednesday, September 30"} / PyTorch handbook</p><h2 id="handbook-title" className="text-2xl font-semibold">{friday ? "PyTorch continuation: from tensors to learning" : "PyTorch foundations: your first tensor calculations"}</h2><p className="max-w-3xl text-sm leading-7 text-white">{friday ? "Continue from Wednesday's tensor basics. Work through reshaping, broadcasting and matrix multiplication, then predictions, loss, gradients and a complete training loop. After these lessons, complete the classroom exercises and independent homework below." : "Set up your notebook and learn essential Python, tensor shapes, data types, indexing and arithmetic. Run and explain these six foundation lessons at your own pace. Stop after the Wednesday recap; the continuation handbook and exercises open on Friday. No Wednesday submission is required."}</p><a href="https://colab.research.google.com/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-white/25 px-4 text-sm font-medium text-white hover:bg-white/10">Open Google Colab<ExternalLink aria-hidden="true" className="size-4" /></a></header>
    <div className="grid items-start gap-8 xl:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="hidden self-start xl:sticky xl:top-6 xl:block"><nav aria-label="Handbook contents" className="max-h-[calc(100vh-3rem)] space-y-5 overflow-y-auto rounded-lg border border-white/20 bg-[#101010] p-4 shadow-[0_12px_32px_rgba(0,0,0,0.4)]"><p className="border-b border-white/20 pb-4 text-base font-semibold text-white">Contents</p><Contents sectionIds={sectionIds} /></nav></aside>
      <div className="min-w-0 space-y-10">
        <details className="group border-y border-white/20 py-4 xl:hidden"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">Handbook contents<ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" /></summary><nav aria-label="Handbook contents" className="pt-6"><Contents sectionIds={sectionIds} /></nav></details>
        {!friday && <section id="onboarding" aria-labelledby="onboarding-title" className="scroll-mt-6 space-y-5">
          <h3 id="onboarding-title" className="flex items-start gap-3 text-2xl font-bold leading-8 text-white"><NotebookPen aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />Portal and Colab setup</h3>
          <p className="text-sm leading-7 text-white">You need your student account, a Google account and a browser. Colab runs Python in a hosted runtime, while your notebook document is saved in Drive. The portal is where you read course material and submit saved snapshots; connecting Drive does not run a notebook.</p>
          <ol className="list-decimal space-y-4 pl-5 text-sm leading-7 text-white">
            <li><strong>Sign in to the student portal.</strong> Open Programme and Week 1. Week access is controlled by your administrator. If Week 1 is locked, contact the instructor; connecting Google Drive does not unlock it.</li>
            <li><strong>Connect Google Drive from Profile.</strong> Use the Google account that will hold your notebook. Allow access to files selected for this app. Never put your Google password, portal password or access tokens in a notebook.</li>
            <li><strong>Create a notebook in Colab.</strong> Sign in with that same Google account and use File &gt; New notebook. Rename it to Week1_Wednesday_YourName.ipynb. If the instructor shares a notebook instead, use File &gt; Save a copy in Drive before editing it.</li>
            <li><strong>Add a text cell.</strong> Put your name, student ID and the title &quot;Wednesday PyTorch learning notes&quot; in it. Text cells explain your work; code cells contain executable Python. A notebook combines both with their outputs.</li>
            <li><strong>Connect the runtime and add a code cell.</strong> Run the setup cell below with the cell&apos;s play button. Wait for it to finish. A busy indicator means the cell is still running; output appears beneath the cell.</li>
            <li><strong>Run one worked example at a time.</strong> Each example below includes its own imports and data. Put each in a separate code cell, read its explanation and compare the output. Do not paste the expected-output text into the code cell.</li>
            <li><strong>Save your notebook.</strong> Use File &gt; Save and check Colab&apos;s saved status. If you close or restart the runtime, saved code remains but variables in memory are lost. Rerun cells from the top when returning.</li>
          </ol>
          <CodeCell title="First code cell" code={`import torch
print("PyTorch is ready")
print(torch.__version__)`} />
          <div className="space-y-2 border-l-2 border-[#82dfff] pl-4 text-sm leading-7 text-white"><p>Expected: PyTorch is ready, followed by the version installed in your runtime. The version can differ from the instructor&apos;s.</p><p>Colab normally includes PyTorch. If import torch reports ModuleNotFoundError, run <code className="font-mono">%pip install torch</code> in a separate Colab code cell, let installation finish, then rerun the setup cell. Installation needs network access; restart the runtime if Colab requests it.</p></div>
          <p className="text-sm leading-7 text-white">You can keep Wednesday&apos;s notebook as learning notes. No Wednesday homework submission is required here. On Friday, use a separate homework notebook. Selecting a file in the portal is not submitting it: a saved receipt confirms submission. Saved snapshots do not change when you edit the Drive original afterward.</p>
        </section>}
        {lessons.map((lesson, index) => <section key={lesson.id} id={lesson.id} aria-labelledby={`${lesson.id}-title`} className="scroll-mt-6 space-y-6 border-t border-white/20 pt-8">
          <div className="space-y-3"><div className="flex items-center gap-3 text-primary">{friday && index >= 3 ? <Workflow aria-hidden="true" className="size-5" /> : <Boxes aria-hidden="true" className="size-5" />}<p className="text-xs font-semibold"><span className="mr-3 font-mono">{String(index + 1).padStart(2, "0")}</span>{friday ? index >= 3 ? "Learning loop" : "Tensor operations" : "Foundations"}</p><span aria-hidden="true" className="h-px w-10 bg-primary/50" /></div><h3 id={`${lesson.id}-title`} className="text-2xl font-bold leading-8 text-white">{lesson.title}</h3></div>
          {lesson.paragraphs.map(paragraph => <p key={paragraph} className="text-sm leading-7 text-white">{paragraph}</p>)}
          <LessonDiagram lessonId={lesson.id} />
          {lesson.examples.map(example => <div key={example.title} className="min-w-0 space-y-4">
            <CodeCell title={example.title} code={example.code} output={example.output} />
            <h4 className="pt-2 text-sm font-bold text-[#82dfff]">Reading the result</h4>
            {example.explanation.map(paragraph => <p key={paragraph} className="text-sm leading-7 text-white">{paragraph}</p>)}
          </div>)}
          <div className="flex items-start gap-3 border-l-2 border-primary bg-primary/5 px-4 py-5"><Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" /><div className="space-y-2"><h4 className="text-sm font-bold text-primary">Key takeaway</h4><p className="text-sm leading-7 text-white">{lesson.remember}</p></div></div>
        </section>)}
        <section id="troubleshooting" aria-labelledby="troubleshooting-title" className="scroll-mt-6 space-y-5 border-t border-white/20 pt-8"><h3 id="troubleshooting-title" className="flex items-start gap-3 text-2xl font-bold leading-8 text-white"><Wrench aria-hidden="true" className="mt-1 size-6 shrink-0 text-[#ffc78a]" />Troubleshooting</h3><p className="text-sm leading-7 text-white">Read the last line of the error first, then find the highlighted line in your cell. Fix the smallest issue and rerun that example. An error is diagnostic information, not a failed submission.</p><dl className="divide-y divide-white/20">
          {[
            ["NameError: name is not defined", "The cell that creates that variable has not run, the spelling differs, or the runtime restarted. Run the complete example, including its import and data definitions."],
            ["IndentationError or SyntaxError", "Check indentation inside def, for and with blocks. Keep opening and closing brackets and quotes paired. Paste only the Python code, not output labels or Markdown fences."],
            ["mean(): could not infer output dtype", "You probably created integer data. Convert with readings = readings.to(torch.float32), then calculate the mean."],
            ["The size of tensor a must match tensor b", "Print both shapes and align them from the right. For a (2, 3) table, column offsets need shape (3,) and row offsets need shape (2, 1)."],
            ["mat1 and mat2 shapes cannot be multiplied", "For matrix multiplication, the last dimension of the first matrix must match the first dimension of the second. Inspect shapes; do not reshape blindly to silence the error."],
            ["shape is invalid for input of size", "The product of the requested dimensions must equal numel(). Six values cannot become a 4-by-2 matrix."],
            ["Expected all tensors to be on the same device", "Move inputs, targets and model parameters to the same device. Moving only one tensor is not enough."],
            ["Tensor does not require grad or has no grad_fn", "Create floating-point parameters with requires_grad=True before computing predictions. Do not use item(), detach() or no_grad() on the training prediction before loss.backward()."],
            ["Trying to backward through the graph a second time", "Recompute predictions and loss for the next step. Do not reuse the previous loss. Normal training does not require retain_graph=True."],
            ["Loss grows or becomes NaN", "Restore the example's learning rate and data first. Check for division by zero, excessively large inputs and uncleared gradients. NaN means 'not a number', not zero loss."],
            ["Notebook missing from Picker", "Check that Colab saved a .ipynb in the connected Google account. Use your own saved copy. A file selected in Profile is page-local; select it again in the week's Submission view when ready."],
          ].filter((_, index) => friday || [0, 1, 2, 6, 10].includes(index)).map(([problem, solution]) => <div key={problem} className="space-y-2 py-4"><dt className="text-sm font-semibold text-[#ffc78a]">{problem}</dt><dd className="text-sm leading-7 text-white">{solution}</dd></div>)}
        </dl></section>
        <section id="reference" aria-labelledby="reference-title" className="scroll-mt-6 space-y-8 border-t border-white/20 pt-8"><h3 id="reference-title" className="flex items-start gap-3 text-2xl font-bold leading-8 text-white"><BookOpen aria-hidden="true" className="mt-1 size-6 shrink-0 text-primary" />Glossary and quick reference</h3><dl aria-label="Glossary terms" className="grid gap-4 sm:grid-cols-2">
          {[
            ["Tensor / shape", "Numerical data and its arrangement. Inspect .shape, .ndim and .numel()."],
            ["dtype / device", "Number representation and storage location. Inspect .dtype and .device; convert with .to(...)."],
            ["Feature / target", "An input measurement and the reference value the model tries to predict."],
            ["Parameter", "An adjustable model value, such as a weight or bias."],
            ["Prediction / loss", "The model's output and a numerical measure of its disagreement with targets."],
            ["Gradient / autograd", "Local sensitivity of loss to a parameter, computed through tracked tensor operations."],
            ["Learning rate / optimizer", "The update scale and the algorithm that adjusts parameters."],
            ["Epoch / batch", "One pass through the training data and the group of examples processed together."],
            ["Inference", "Using learned parameters to make predictions, usually without tracking gradients."],
            ["Training versus evaluation", "Training changes parameters. Evaluation measures performance on data not used to adjust them."],
          ].filter((_, index) => friday || index < 2).map(([term, meaning], index) => {
            const TermIcon = index < 2 ? Boxes : index < 8 ? Workflow : BookOpen;
            const accent = index < 2 ? "border-t-[#82dfff] text-[#82dfff]" : index < 8 ? "border-t-primary text-primary" : "border-t-[#ffc78a] text-[#ffc78a]";
            return <div key={term} className={`min-w-0 space-y-4 rounded-lg border border-white/25 border-t-2 bg-[#111416] p-5 ${accent}`}>
              <dt className="flex items-start gap-3 text-base font-bold leading-6"><TermIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />{term}</dt>
              <dd className="text-sm leading-7 text-white">{meaning}</dd>
            </div>;
          })}
          </dl>
          <div className="space-y-5 border-y border-white/20 py-6">
            <h4 className="flex items-center gap-3 text-lg font-bold text-white"><Code2 aria-hidden="true" className="size-5 shrink-0 text-[#82dfff]" />Keep these operations nearby</h4>
            <dl aria-label="Quick reference operations" className="divide-y divide-white/20">
              {[
                ["Create", "torch.tensor(data, dtype=torch.float32)"],
                ["Select", "values[row, column] / values[:, column]"],
                ["Reshape", "values.reshape(rows, columns) / matrix.T"],
                ["Reduce", "values.mean(dim=0) / values.mean(dim=1)"],
                ["Multiply", "left * right = element-wise; left @ right = matrix product"],
                ["Train", "optimizer.zero_grad(); loss.backward(); optimizer.step()"],
              ].filter(([label]) => friday || ["Create", "Select", "Reduce"].includes(label)).map(([label, operation]) => <div key={label} className="grid min-w-0 gap-2 py-4 sm:grid-cols-[100px_minmax(0,1fr)] sm:gap-4">
                <dt className="text-sm font-semibold leading-7 text-[#82dfff]">{label}</dt>
                <dd className="min-w-0 font-mono text-[13px] leading-7 text-white [overflow-wrap:anywhere]"><code>{operation}</code></dd>
              </div>)}
            </dl>
          </div>
          <div className="flex items-start gap-4 border-l-2 border-primary bg-primary/5 p-5"><NotebookPen aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" /><p className="text-sm leading-7 text-white"><strong className="font-bold text-primary">{friday ? "Friday recap: " : "Wednesday recap: "}</strong>{friday ? "You can rearrange tensors, explain broadcasting and trace a complete learning loop. Continue with the classroom exercises below, then complete and submit your independent homework." : "You have a saved notebook and can create, inspect, select and calculate with tensors. This completes Wednesday's learning. Revisit any output you cannot explain; continue with Friday's handbook when it opens."}</p></div>
          <div className="space-y-5"><h4 className="text-lg font-bold text-white">Official references</h4><ul aria-label="Official references" className="grid gap-4 sm:grid-cols-2">
            {[
              ["PyTorch: Tensors", "https://docs.pytorch.org/tutorials/beginner/basics/tensorqs_tutorial.html"],
              ["PyTorch: Automatic differentiation", "https://docs.pytorch.org/tutorials/beginner/basics/autogradqs_tutorial.html"],
            ].filter((_, index) => friday || index === 0).map(([title, href]) => <li key={href} className="min-w-0"><a className="group flex h-full items-start gap-4 rounded-lg border border-white/25 bg-[#111416] p-5 transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" href={href} target="_blank" rel="noreferrer">
              <BookOpen aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 space-y-2"><span className="block text-xs font-medium text-[#82dfff]">docs.pytorch.org</span><span className="block text-sm font-semibold leading-6 text-white group-hover:text-primary">{title}</span></span>
              <ExternalLink aria-hidden="true" className="mt-1 size-4 shrink-0 text-white" />
            </a></li>)}
          </ul></div>
        </section>
      </div>
    </div>
  </section>;
}

function FridayLocked() {
  return <section aria-labelledby="practice-title" className="space-y-4 border-y border-white/20 py-8"><LockKeyhole aria-hidden="true" className="size-6 text-primary" /><h2 id="practice-title" className="text-xl font-semibold">Friday handbook, exercises and homework are locked</h2><p className="text-sm leading-7 text-white">Opens Friday, October 2, 2026 at 12:00 AM IST. Wednesday&apos;s PyTorch foundations remain available in the Wednesday Handbook.</p><time dateTime="2026-10-02T00:00:00+05:30" className="block text-sm font-medium text-primary">Friday / October 2</time></section>;
}

export function WeekOneHomework() {
  if (!weekOnePracticeOpen()) return <FridayLocked />;
  return <div className="space-y-12"><WeekOneHandbook day="friday" /><section aria-labelledby="practice-title" className="max-w-4xl space-y-8">
    <header className="space-y-3"><p className="text-sm font-medium text-primary">Friday, October 2 / Practice</p><h2 id="practice-title" className="text-xl font-semibold">Exercises and homework</h2><p className="text-sm leading-7 text-white">Complete Friday&apos;s continuation handbook above first. Use both days&apos; lessons as references during classroom exercises, then work independently on the homework and submit your notebook. Explain the results in text cells, not just code.</p></header>
    <section className="space-y-5 border-t border-white/20 pt-6"><h3 className="flex items-center gap-2 text-lg font-semibold"><BookOpen aria-hidden="true" className="size-5 text-primary" />Classroom exercises</h3><ol className="list-decimal space-y-5 pl-5 text-sm leading-7 text-white">
      <li><strong>Inspect and summarize measurements.</strong> Create a float32 tensor from [[10, 20, 30], [20, 30, 40]]. Print its shape, data type and element count. Select the second column; calculate a mean for each row and each column. Check: row means are [20, 30] and column means are [15, 25, 35]. Explain why the dimensions differ.</li>
      <li><strong>Apply two kinds of corrections.</strong> Add column offsets [1, 2, 3] to the same table. Separately add row offsets [5, 10], arranged with the correct shape. Print both results and explain why the row offsets need a second dimension.</li>
      <li><strong>Build a weighted score.</strong> Use measurements [[2, 1], [4, 3]] and weights [[3], [2]]. Predict the result by hand, then calculate it with @. Compare it with element-wise multiplication by [3, 2]. Check: matrix-product scores are [[8], [18]].</li>
      <li><strong>Trace one gradient step.</strong> Start a scalar weight at 1.0 with gradients enabled. Use prediction = weight * 3 and target = 9. Calculate squared error, call backward(), then make one update with learning rate 0.05. Record the old loss, gradient, updated weight and new loss. Explain the gradient&apos;s sign using the handbook&apos;s chain-rule example.</li>
    </ol></section>
    <section className="space-y-5 border-t border-white/20 pt-6"><h3 className="text-lg font-semibold">Independent homework: calibrate a sensor</h3><p className="text-sm leading-7 text-white">Create Week1_Homework_YourName.ipynb in your own Drive. Use synthetic input readings [1.0, 2.0, 3.0, 4.0] and reference targets [3.0, 6.0, 9.0, 12.0]. Fit prediction = weight * input, without a bias. This is an educational simulation, not a safety-critical calibration procedure.</p><ol className="list-decimal space-y-3 pl-5 text-sm leading-7 text-white"><li>Add your name, student ID and a short explanation of the problem in a text cell.</li><li>Create the input and target tensors as float32. Print their shapes and verify that the shapes match.</li><li>Start weight at 0.0 with requires_grad=True. Use torch.optim.SGD with learning rate 0.01 and train for 50 epochs using mean squared error. Clear gradients on every step.</li><li>Record the initial loss and the losses before updates at epochs 10, 20, 30, 40 and 50. Recompute the final loss after the last update and print the learned weight.</li><li>Predict for a new reading of 5.0 inside no_grad(). State the reference answer implied by the synthetic rule and compare it with your prediction. Explain why this is not enough to validate a real sensor model.</li><li>In your own words, explain what backward(), zero_grad() and step() each do. Explain one issue you encountered or one shape/type check that prevented an error.</li></ol><p className="text-sm leading-7 text-white">Self-check: loss should decrease substantially, the weight should approach 3 and the new prediction should approach 15. Do not replace training with a hard-coded weight or output. Exact final decimals can vary slightly.</p></section>
    <section className="space-y-4 border-t border-white/20 pt-6"><h3 className="text-lg font-semibold">Before submitting</h3><ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-white"><li>Restart the runtime and run all notebook cells from top to bottom. Resolve errors and retain the relevant outputs.</li><li>Save to Drive. Remove secrets and unnecessary large outputs; the portal accepts .ipynb files up to 2 MiB.</li><li>Open Submission, select the saved homework notebook and submit. Keep the receipt and verify that the downloaded snapshot contains your latest work.</li><li>A later edit to your Drive notebook does not change a saved submission. Select the updated notebook for a new attempt when needed. The portal permits up to twenty attempts per student/week/work type, separately for practical and homework.</li></ul><p className="text-sm leading-7 text-white">Review focuses on correct tensor operations, a reproducible learning loop, retained results and your explanations. No automatic grade is assigned by submission storage. A submission deadline has not been specified; follow the instructor&apos;s announcement.</p></section>
  </section></div>;
}