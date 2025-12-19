# Mono-syllable Model Spec
Confusion model, the model should be a categorical classifier, giving the probability of guessing each of the syllables, when played a sound. 
The model should be designed in a way that it can take additional covariates in time. Specific covariates would be

- which letter
- which playback speed
- which voice

The observed answers should be treated as samples from the distribution.
P(x=x | x in choices).

# Interface
The interface should be something like
ToneT = Literal['falling', 'rising', 'flat'...]
class Problem(BaseModel):
    tone: ToneT

def get_confusion_prob_batch(problems: list[Problem], state: StateT) -> list[dict[ToneT, float]]
def get_confuion_prob(problem: Problem, state: StateT) -> dict[ToneT, float]
def update_state(init_state: StateT, problem: Problem, alternatives: list[ToneT], choice: ToneT) -> StateT

