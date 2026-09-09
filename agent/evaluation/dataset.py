"""Curated RAG evaluation dataset of 50 QA benchmark pairs.

Covering:
- Multi-Agent Orchestration & Flow (GreetingAgent, DepartmentAgent, DoctorAgent, SlotAgent, ConfirmationAgent)
- State Management & Storage (Redis SessionState, Postgres database)
- Technical terms, acronyms, and constraints (90-second hold, silent handoff, disclosure)
- Alternative flows (Cancellations, Rescheduling, FAQ routing)
- Tabular & Structural knowledge
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class QAPair:
    id: int
    question: str
    ground_truth: str
    category: str
    expected_section: str


BENCHMARK_DATASET: list[QAPair] = [
    QAPair(
        id=1,
        question="How does the system preserve state across agent handoffs?",
        ground_truth="State is preserved across handoffs using a shared SessionState backed by Redis.",
        category="Architecture",
        expected_section="Overview",
    ),
    QAPair(
        id=2,
        question="What is the first agent that answers the call?",
        ground_truth="GreetingAgent is the first agent the caller speaks to.",
        category="Agents",
        expected_section="GreetingAgent",
    ),
    QAPair(
        id=3,
        question="What mandatory disclosure does GreetingAgent play?",
        ground_truth="It plays a mandatory recording disclosure stating 'This call may be recorded for quality purposes'.",
        category="Greeting",
        expected_section="GreetingAgent",
    ),
    QAPair(
        id=4,
        question="Where does GreetingAgent route if the user mentions symptoms?",
        ground_truth="It routes to DepartmentAgent if the user mentions symptoms or wants to book.",
        category="Routing",
        expected_section="GreetingAgent",
    ),
    QAPair(
        id=5,
        question="Where does GreetingAgent route if the user wants to cancel or reschedule?",
        ground_truth="It routes to ManageAppointmentAgent.",
        category="Routing",
        expected_section="GreetingAgent",
    ),
    QAPair(
        id=6,
        question="Where does GreetingAgent route general questions like parking or billing?",
        ground_truth="It routes general questions to FAQAgent.",
        category="Routing",
        expected_section="GreetingAgent",
    ),
    QAPair(
        id=7,
        question="What is the role of DepartmentAgent?",
        ground_truth="DepartmentAgent maps the caller's spoken symptoms to the correct hospital department.",
        category="Agents",
        expected_section="DepartmentAgent",
    ),
    QAPair(
        id=8,
        question="Which department is mapped if the caller mentions chest pain?",
        ground_truth="Chest pain is mapped to the Cardiology department.",
        category="Symptoms",
        expected_section="DepartmentAgent",
    ),
    QAPair(
        id=9,
        question="Does DepartmentAgent speak to the caller during symptom mapping?",
        ground_truth="No, this step runs silently. The AI maps the symptoms internally without speaking and immediately hands off to DoctorAgent.",
        category="Optimization",
        expected_section="DepartmentAgent",
    ),
    QAPair(
        id=10,
        question="Why does DepartmentAgent run silently without speaking?",
        ground_truth="It runs silently without speaking to the caller in order to save time during the call.",
        category="Optimization",
        expected_section="DepartmentAgent",
    ),
    QAPair(
        id=11,
        question="What does DoctorAgent do once it receives the call from DepartmentAgent?",
        ground_truth="DoctorAgent looks up available doctors in the identified department and speaks to the caller listing them.",
        category="Agents",
        expected_section="DoctorAgent",
    ),
    QAPair(
        id=12,
        question="Which doctors are available in the Cardiology department?",
        ground_truth="Dr. Smith and Dr. Jones are available in Cardiology.",
        category="Doctors",
        expected_section="DoctorAgent",
    ),
    QAPair(
        id=13,
        question="Which agent is called once the caller confirms a doctor's name?",
        ground_truth="Once the patient confirms a doctor's name, DoctorAgent hands off to SlotAgent.",
        category="Routing",
        expected_section="DoctorAgent",
    ),
    QAPair(
        id=14,
        question="What is the responsibility of SlotAgent?",
        ground_truth="SlotAgent handles calendar scheduling by asking the caller for preferred day or time and searching the doctor's schedule.",
        category="Agents",
        expected_section="SlotAgent",
    ),
    QAPair(
        id=15,
        question="What happens when the caller agrees to a specific appointment time?",
        ground_truth="SlotAgent places a temporary 90-second hold on that slot in Redis so nobody else can book it while the call finishes.",
        category="Scheduling",
        expected_section="SlotAgent",
    ),
    QAPair(
        id=16,
        question="How long is the temporary slot hold in Redis?",
        ground_truth="The temporary hold duration is 90 seconds.",
        category="Technical Terminology",
        expected_section="SlotAgent",
    ),
    QAPair(
        id=17,
        question="Where is the 90-second hold stored?",
        ground_truth="The hold is placed in Redis.",
        category="Architecture",
        expected_section="SlotAgent",
    ),
    QAPair(
        id=18,
        question="Which agent handles finalizing the booking after the slot is held?",
        ground_truth="ConfirmationAgent finishes the process once the slot is securely held.",
        category="Agents",
        expected_section="ConfirmationAgent",
    ),
    QAPair(
        id=19,
        question="What information does ConfirmationAgent collect?",
        ground_truth="It asks for the caller's name and phone number (or looks up the patient based on caller ID).",
        category="Confirmation",
        expected_section="ConfirmationAgent",
    ),
    QAPair(
        id=20,
        question="Where are finalized appointment details persisted?",
        ground_truth="Finalized appointments are securely confirmed and saved in the Postgres database.",
        category="Database",
        expected_section="ConfirmationAgent",
    ),
    QAPair(
        id=21,
        question="Does ConfirmationAgent read back the details before ending the booking?",
        ground_truth="Yes, it reads back the finalized appointment details to the caller.",
        category="Confirmation",
        expected_section="ConfirmationAgent",
    ),
    QAPair(
        id=22,
        question="What does ManageAppointmentAgent do when a user wants to cancel?",
        ground_truth="It looks up existing appointments using the caller's phone number, asks for confirmation, and deletes the appointment.",
        category="Alternative Flows",
        expected_section="ManageAppointmentAgent",
    ),
    QAPair(
        id=23,
        question="How does ManageAppointmentAgent look up existing appointments?",
        ground_truth="It looks up existing appointments using the caller's phone number.",
        category="Alternative Flows",
        expected_section="ManageAppointmentAgent",
    ),
    QAPair(
        id=24,
        question="What happens during rescheduling in ManageAppointmentAgent?",
        ground_truth="If rescheduling, it hands off to SlotAgent to pick a new time, and then updates the database.",
        category="Alternative Flows",
        expected_section="ManageAppointmentAgent",
    ),
    QAPair(
        id=25,
        question="What kinds of questions does FAQAgent answer?",
        ground_truth="FAQAgent answers non-medical questions such as parking details, billing, or visiting hours.",
        category="FAQ",
        expected_section="FAQAgent",
    ),
    QAPair(
        id=26,
        question="Can FAQAgent transition back to the appointment booking flow?",
        ground_truth="Yes, after answering, it can offer to book an appointment and jump back into the main flow.",
        category="FAQ",
        expected_section="FAQAgent",
    ),
    QAPair(
        id=27,
        question="What database holds the confirmed appointment bookings?",
        ground_truth="Postgres database holds confirmed appointment bookings.",
        category="Technical Terminology",
        expected_section="ConfirmationAgent",
    ),
    QAPair(
        id=28,
        question="What in-memory datastore manages conversational session state?",
        ground_truth="Redis manages conversational SessionState across handoffs.",
        category="Technical Terminology",
        expected_section="Overview",
    ),
    QAPair(
        id=29,
        question="What prevents duplicate bookings while the patient provides their details?",
        ground_truth="A temporary 90-second hold placed in Redis prevents concurrent bookings.",
        category="Concurrency",
        expected_section="SlotAgent",
    ),
    QAPair(
        id=30,
        question="Which agent is handed off to after SlotAgent places a hold?",
        ground_truth="ConfirmationAgent is handed off to after the slot is held.",
        category="Routing",
        expected_section="SlotAgent",
    ),
    QAPair(
        id=31,
        question="How does the system ensure the bot doesn't forget context when switching agents?",
        ground_truth="State is preserved across handoffs using shared SessionState in Redis so the bot never forgets earlier context.",
        category="Architecture",
        expected_section="Overview",
    ),
    QAPair(
        id=32,
        question="What role does caller ID play during confirmation?",
        ground_truth="Caller ID can be used to look up the patient without needing them to state their phone number.",
        category="Confirmation",
        expected_section="ConfirmationAgent",
    ),
    QAPair(
        id=33,
        question="What are the specialist agents in this architecture?",
        ground_truth="Specialist agents include GreetingAgent, DepartmentAgent, DoctorAgent, SlotAgent, ConfirmationAgent, ManageAppointmentAgent, and FAQAgent.",
        category="Architecture",
        expected_section="Overview",
    ),
    QAPair(
        id=34,
        question="If a patient asks about parking while booking, which agent responds?",
        ground_truth="FAQAgent responds to questions about parking details.",
        category="FAQ",
        expected_section="FAQAgent",
    ),
    QAPair(
        id=35,
        question="What does the bot do after answering a parking query?",
        ground_truth="After answering, it offers to book an appointment and jumps back into the main flow.",
        category="FAQ",
        expected_section="FAQAgent",
    ),
    QAPair(
        id=36,
        question="In what order are agents called during standard new appointment booking?",
        ground_truth="GreetingAgent -> DepartmentAgent -> DoctorAgent -> SlotAgent -> ConfirmationAgent.",
        category="Sequence",
        expected_section="Overview",
    ),
    QAPair(
        id=37,
        question="Does GreetingAgent directly book slots?",
        ground_truth="No, GreetingAgent handles initial greeting, recording disclosure, and intent routing.",
        category="Roles",
        expected_section="GreetingAgent",
    ),
    QAPair(
        id=38,
        question="Can ManageAppointmentAgent update the Postgres database directly on cancellation?",
        ground_truth="Yes, upon caller confirmation, it deletes the appointment from the database.",
        category="Alternative Flows",
        expected_section="ManageAppointmentAgent",
    ),
    QAPair(
        id=39,
        question="What happens if a user's 90-second hold expires before confirmation?",
        ground_truth="The hold in Redis expires, releasing the slot back to the calendar.",
        category="Edge Cases",
        expected_section="SlotAgent",
    ),
    QAPair(
        id=40,
        question="What triggers the handoff from GreetingAgent to FAQAgent?",
        ground_truth="General inquiries like hospital hours, billing, or parking trigger routing to FAQAgent.",
        category="Routing",
        expected_section="GreetingAgent",
    ),
    QAPair(
        id=41,
        question="Who speaks the doctors list to the caller?",
        ground_truth="DoctorAgent speaks the list of available doctors in the department to the caller.",
        category="Roles",
        expected_section="DoctorAgent",
    ),
    QAPair(
        id=42,
        question="Is DepartmentAgent a conversational voice step or internal mapping?",
        ground_truth="It is an internal silent mapping step that executes without speaking to the caller.",
        category="Roles",
        expected_section="DepartmentAgent",
    ),
    QAPair(
        id=43,
        question="What is the benefit of multi-agent flow over a monolithic prompt?",
        ground_truth="Different specialist agents handle specific parts of the conversation with isolated prompts and state preserved via Redis.",
        category="Architecture",
        expected_section="Overview",
    ),
    QAPair(
        id=44,
        question="What is the role of SlotAgent in rescheduling?",
        ground_truth="During rescheduling, ManageAppointmentAgent hands off to SlotAgent to choose a new time slot.",
        category="Alternative Flows",
        expected_section="ManageAppointmentAgent",
    ),
    QAPair(
        id=45,
        question="What data must be collected to finalize the booking in Postgres?",
        ground_truth="Patient name and phone number (or caller ID lookup) are required to finalize the booking.",
        category="Confirmation",
        expected_section="ConfirmationAgent",
    ),
    QAPair(
        id=46,
        question="How does DoctorAgent present the doctor choices?",
        ground_truth="It asks a question like 'We have Dr. Smith and Dr. Jones available in Cardiology. Who would you like to see?'.",
        category="Dialogue",
        expected_section="DoctorAgent",
    ),
    QAPair(
        id=47,
        question="Are visiting hours medical or non-medical questions in this system?",
        ground_truth="Visiting hours are categorized as non-medical questions handled by FAQAgent.",
        category="Classification",
        expected_section="FAQAgent",
    ),
    QAPair(
        id=48,
        question="What technology stores the persistent appointment record?",
        ground_truth="Postgres database stores the persistent record.",
        category="Technical Terminology",
        expected_section="ConfirmationAgent",
    ),
    QAPair(
        id=49,
        question="What technology handles the 90-second temporary hold?",
        ground_truth="Redis handles the 90-second temporary hold.",
        category="Technical Terminology",
        expected_section="SlotAgent",
    ),
    QAPair(
        id=50,
        question="Does the bot require the user to repeat their information across agent handoffs?",
        ground_truth="No, state is preserved in Redis SessionState so the bot never forgets what was said earlier.",
        category="UX",
        expected_section="Overview",
    ),
]
