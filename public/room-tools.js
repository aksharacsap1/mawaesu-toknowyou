import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { buildRoomDescriptionPlan } from "./room-plan.js";

const $ = id => document.getElementById(id);

function setRoomStatus(message, error = false) {
  const status = $("roomPlanStatus");
  status.textContent = message;
  status.style.color = error ? "#a63c34" : "";
}

export function initializeRoomTools({ auth, db }) {
  let currentUser = null;

  function renderPlan(plan, savedPlan = null) {
    const results = $("roomPlanResults");
    results.replaceChildren();

    const summary = document.createElement("div");
    summary.className = "socialItem";
    const heading = document.createElement("h3");
    heading.textContent = `${plan.archetypeName} · your room plan`;
    const timeframe = document.createElement("p");
    timeframe.textContent = `Estimated timeframe: ${plan.schedule.length} day${plan.schedule.length === 1 ? "" : "s"} at ${plan.dailyMinutes} minutes per day.`;
    const disclaimer = document.createElement("p");
    disclaimer.textContent = plan.disclaimer;
    summary.append(heading, timeframe, disclaimer);

    if (plan.observations.length) {
      const observations = document.createElement("ul");
      for (const observation of plan.observations) {
        const item = document.createElement("li");
        item.textContent = observation;
        observations.appendChild(item);
      }
      summary.appendChild(observations);
    }
    results.appendChild(summary);

    const completed = new Set(savedPlan?.completedTaskIds || []);
    for (const day of plan.schedule) {
      const section = document.createElement("section");
      section.className = "taskDay";
      const dayMinutes = day.tasks.reduce((total, task) => total + task.minutes, 0);
      const dayHeading = document.createElement("h3");
      dayHeading.textContent = `Day ${day.day} · ${dayMinutes} minutes`;
      section.appendChild(dayHeading);

      for (let taskIndex = 0; taskIndex < day.tasks.length; taskIndex++) {
        const task = day.tasks[taskIndex];
        const taskId = `day-${day.day}-task-${taskIndex}`;
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = completed.has(taskId);
        checkbox.disabled = !savedPlan?.id;
        checkbox.setAttribute("aria-label", `Mark complete: ${task.title}`);
        checkbox.addEventListener("change", async () => {
          if (!savedPlan?.id || !currentUser) return;
          const updated = new Set(completed);
          if (checkbox.checked) updated.add(taskId);
          else updated.delete(taskId);
          try {
            await updateDoc(doc(db, "users", currentUser.uid, "roomPlans", savedPlan.id), {
              completedTaskIds: [...updated],
              updatedAt: serverTimestamp()
            });
            completed.clear();
            updated.forEach(value => completed.add(value));
          } catch (error) {
            checkbox.checked = !checkbox.checked;
            setRoomStatus(`Could not save task progress: ${error.message}`, true);
          }
        });
        const description = document.createElement("span");
        description.textContent = `${task.title} (${task.minutes} min) — ${plan.steps[task.stepIndex]?.instructions || ""}`;
        label.append(checkbox, description);
        section.appendChild(label);

        const materials = plan.steps[task.stepIndex]?.materials || [];
        if (materials.length) {
          const materialsText = document.createElement("p");
          materialsText.textContent = `You may find these useful: ${materials.join(", ")}`;
          section.appendChild(materialsText);
        }
      }
      results.appendChild(section);
    }
  }

  async function createPlan() {
    if (!currentUser) {
      setRoomStatus("Sign in before creating a room plan.", true);
      return;
    }

    let topResults;
    try {
      topResults = JSON.parse(localStorage.getItem("archetypeTopThree") || "[]");
    } catch (error) {
      setRoomStatus(`Saved archetype results could not be read: ${error.message}`, true);
      return;
    }
    const archetypeName = topResults[0]?.name;
    if (!archetypeName) {
      setRoomStatus("Complete the self-discovery quiz first so your room plan can reflect your archetype.", true);
      return;
    }

    const description = $("roomDescriptionInput").value.trim();
    const dailyMinutes = Number($("dailyRoomMinutes").value);
    let plan;
    try {
      plan = buildRoomDescriptionPlan(archetypeName, description, dailyMinutes);
    } catch (error) {
      setRoomStatus(error.message, true);
      $("roomDescriptionInput").focus();
      return;
    }

    const button = $("createRoomPlanBtn");
    button.disabled = true;
    setRoomStatus("Creating your private daily plan…");
    try {
      const planRef = doc(collection(db, "users", currentUser.uid, "roomPlans"));
      const planData = {
        archetypeName: plan.archetypeName,
        dailyMinutes,
        observations: plan.observations,
        steps: plan.steps,
        schedule: plan.schedule,
        completedTaskIds: [],
        disclaimer: plan.disclaimer,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(planRef, planData);
      renderPlan({ ...plan, dailyMinutes }, { id: planRef.id, completedTaskIds: [] });
      setRoomStatus("Your room plan is saved privately. Your room description was not saved.");
    } catch (error) {
      console.error("Could not save the room plan.", error);
      setRoomStatus(`Could not save your room plan: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  }

  async function loadLatestPlan(user) {
    if (!user) return;
    try {
      const snapshot = await getDocs(query(
        collection(db, "users", user.uid, "roomPlans"),
        orderBy("createdAt", "desc"),
        limit(1)
      ));
      if (snapshot.empty) return;
      const planDocument = snapshot.docs[0];
      const plan = planDocument.data();
      renderPlan(plan, { id: planDocument.id, completedTaskIds: plan.completedTaskIds });
      $("dailyRoomMinutes").value = String(plan.dailyMinutes);
      setRoomStatus("Showing your latest saved plan. Room descriptions are not stored.");
    } catch (error) {
      setRoomStatus(`Could not load your saved room plan: ${error.message}`, true);
    }
  }

  $("createRoomPlanBtn").addEventListener("click", createPlan);
  document.addEventListener("mawaesu-page-change", event => {
    if (event.detail === "roomAnalysisPage") void loadLatestPlan(currentUser);
  });
  onAuthStateChanged(auth, user => {
    const accountChanged = currentUser?.uid !== user?.uid;
    currentUser = user;
    if (accountChanged) {
      $("roomPlanResults").replaceChildren();
      $("roomDescriptionInput").value = "";
      setRoomStatus("");
    }
    if (user && $("roomAnalysisPage").classList.contains("active")) {
      void loadLatestPlan(user);
    }
  });

  return { createPlan };
}
